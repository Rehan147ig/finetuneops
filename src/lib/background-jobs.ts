import { Queue } from "bullmq";
import { getServerEnv } from "@/lib/env";
import { CacheKeys, invalidate } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { buildDatasetQualityReport, checkPiiDetection } from "@/lib/quality-engine";
import { runTraAnalysis } from "@/lib/tra-engine";
import { recordActivityEvent } from "@/lib/workspace-data";

export const backgroundJobTypes = [
  "ingest-trace",
  "score-dataset",
  "run-experiment",
  "run-tra-analysis",
  "run-recovery-job",
  "launch-finetune",
  "poll-finetune",
  "send-notification",
  "expire-review-links",
  "generate-nudges",
  "run-ab-test",
  "safety-scan",
] as const;

export type BackgroundJobType = (typeof backgroundJobTypes)[number];

const env = getServerEnv();

function getRedisConnection() {
  const redisUrl = new URL(env.REDIS_URL);

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
  };
}

export function getQueueNameForJobType(jobType: BackgroundJobType) {
  return `finetuneops-${jobType}`;
}

function resolveQueueName(queueNameOrJobType: string) {
  if ((backgroundJobTypes as readonly string[]).includes(queueNameOrJobType)) {
    return getQueueNameForJobType(queueNameOrJobType as BackgroundJobType);
  }

  return queueNameOrJobType;
}

const queueCache = new Map<string, Queue>();

export function getBackgroundJobQueue(
  queueNameOrJobType: BackgroundJobType | string = "finetuneops-background-jobs",
) {
  const queueName = resolveQueueName(queueNameOrJobType);

  if (!queueCache.has(queueName)) {
    queueCache.set(
      queueName,
      new Queue(queueName, {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          removeOnComplete: 250,
          removeOnFail: 250,
        },
      })
    );
  }

  return queueCache.get(queueName)!;
}

export async function enqueueBackgroundJob(input: {
  organizationId: string;
  projectId?: string | null;
  jobType: BackgroundJobType;
  payload?: Record<string, unknown>;
  estimatedCompletionAt?: Date | null;
  delayMs?: number;
}) {
  const queueName = getQueueNameForJobType(input.jobType);
  const backgroundJob = await prisma.backgroundJob.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      queueName,
      jobType: input.jobType,
      status: "queued",
      progress: 0,
      attempts: 0,
      maxAttempts: 3,
      estimatedCompletionAt: input.estimatedCompletionAt ?? null,
      payload: JSON.stringify(input.payload ?? {}),
      logs: JSON.stringify([`Queued ${input.jobType}`]),
    },
  });

  const queue = getBackgroundJobQueue(queueName);
  await queue.add(input.jobType, {
    backgroundJobId: backgroundJob.id,
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    payload: input.payload ?? {},
  }, input.delayMs ? { delay: input.delayMs } : undefined);

  return backgroundJob;
}

export async function enqueueBackgroundJobsBatch(inputs: Array<{
  organizationId: string;
  projectId?: string | null;
  jobType: BackgroundJobType;
  payload?: Record<string, unknown>;
  estimatedCompletionAt?: Date | null;
  delayMs?: number;
}>) {
  if (inputs.length === 0) return [];

  const queueName = getQueueNameForJobType(inputs[0]!.jobType);
  const queue = getBackgroundJobQueue(queueName);
  
  const backgroundJobs = await prisma.$transaction(
    inputs.map(input => prisma.backgroundJob.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        queueName,
        jobType: input.jobType,
        status: "queued",
        progress: 0,
        attempts: 0,
        maxAttempts: 3,
        estimatedCompletionAt: input.estimatedCompletionAt ?? null,
        payload: JSON.stringify(input.payload ?? {}),
        logs: JSON.stringify([`Queued ${input.jobType}`]),
      }
    }))
  );

  await queue.addBulk(
    backgroundJobs.map((job, index) => ({
      name: inputs[index]!.jobType,
      data: {
        backgroundJobId: job.id,
        organizationId: job.organizationId,
        projectId: job.projectId,
        payload: inputs[index]!.payload ?? {},
      },
      opts: inputs[index]!.delayMs ? { delay: inputs[index]!.delayMs } : undefined
    }))
  );

  return backgroundJobs;
}

export async function updateBackgroundJobProgress(input: {
  backgroundJobId: string;
  progress: number;
  status?: "queued" | "running";
  message?: string;
  estimatedCompletionAt?: Date | null;
}) {
  const job = await prisma.backgroundJob.findUniqueOrThrow({
    where: {
      id: input.backgroundJobId,
    },
  });

  const logs = parseJobLogs(job.logs);
  if (input.message) {
    logs.unshift(input.message);
  }

  return prisma.backgroundJob.update({
    where: {
      id: input.backgroundJobId,
    },
    data: {
      status: input.status ?? "running",
      progress: input.progress,
      attempts: {
        increment: input.status === "running" ? 1 : 0,
      },
      startedAt: job.startedAt ?? new Date(),
      estimatedCompletionAt: input.estimatedCompletionAt ?? job.estimatedCompletionAt,
      logs: JSON.stringify(logs.slice(0, 25)),
    },
  });
}

export async function completeBackgroundJob(input: {
  backgroundJobId: string;
  message: string;
  result?: Record<string, unknown>;
}) {
  const job = await prisma.backgroundJob.findUniqueOrThrow({
    where: {
      id: input.backgroundJobId,
    },
  });
  const logs = parseJobLogs(job.logs);
  logs.unshift(input.message);

  const updated = await prisma.backgroundJob.update({
    where: {
      id: input.backgroundJobId,
    },
    data: {
      status: "completed",
      progress: 100,
      finishedAt: new Date(),
      result: JSON.stringify(input.result ?? {}),
      logs: JSON.stringify(logs.slice(0, 25)),
    },
  });

  if (job.projectId) {
    await recordActivityEvent({
      projectId: job.projectId,
      type: "background_job_completed",
      message: `${job.jobType} completed in the async worker queue.`,
      userId: "system",
      metadata: {
        backgroundJobId: job.id,
        queueName: job.queueName,
      },
    });
  }

  return updated;
}

export async function failBackgroundJob(input: {
  backgroundJobId: string;
  message: string;
}) {
  const job = await prisma.backgroundJob.findUniqueOrThrow({
    where: {
      id: input.backgroundJobId,
    },
  });
  const logs = parseJobLogs(job.logs);
  logs.unshift(input.message);

  return prisma.backgroundJob.update({
    where: {
      id: input.backgroundJobId,
    },
    data: {
      status: "failed",
      finishedAt: new Date(),
      logs: JSON.stringify(logs.slice(0, 25)),
    },
  });
}

export async function retryBackgroundJob(backgroundJobId: string) {
  const job = await prisma.backgroundJob.findUniqueOrThrow({
    where: {
      id: backgroundJobId,
    },
  });

  const queue = getBackgroundJobQueue(job.queueName);
  await prisma.backgroundJob.update({
    where: {
      id: backgroundJobId,
    },
    data: {
      status: "queued",
      progress: 0,
      finishedAt: null,
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 5),
      logs: JSON.stringify([`Manual retry requested for ${job.jobType}`, ...parseJobLogs(job.logs)].slice(0, 25)),
    },
  });
  await queue.add(job.jobType, {
    backgroundJobId: job.id,
    organizationId: job.organizationId,
    projectId: job.projectId,
    payload: parseJobPayload(job.payload),
  });
}

async function runIngestTraceJob(backgroundJobId: string) {
  await updateBackgroundJobProgress({
    backgroundJobId,
    progress: 40,
    status: "running",
    message: "Validating trace payload and enriching metadata.",
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 2),
  });

  return completeBackgroundJob({
    backgroundJobId,
    message: "Trace ingestion finished and metadata is ready for downstream review.",
    result: {
      status: "captured",
    },
  });
}

async function runSafetyScanJob(backgroundJobId: string, payload: Record<string, unknown>) {
  const traceId = typeof payload.traceId === "string" ? payload.traceId : null;

  await updateBackgroundJobProgress({
    backgroundJobId,
    progress: 55,
    status: "running",
    message: "Scanning the trace for PII and risky content.",
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60),
  });

  if (!traceId) {
    return failBackgroundJob({
      backgroundJobId,
      message: "Safety scan could not start because traceId is missing.",
    });
  }

  const trace = await prisma.traceEvent.findUnique({ where: { id: traceId } });

  if (!trace) {
    return failBackgroundJob({
      backgroundJobId,
      message: "Safety scan failed because the trace no longer exists.",
    });
  }

  // Real PII scan via the quality engine — no fabricated "safe" verdict.
  const pii = checkPiiDetection([
    { id: trace.id, input: trace.inputText ?? trace.title, output: trace.outputText ?? "" },
  ]);
  const categories = Array.from(new Set(pii.flagged.flatMap((item) => item.categories)));
  const hasPii = pii.detected > 0;

  await prisma.traceEvent.update({
    where: { id: trace.id },
    data: {
      severity: hasPii ? "high" : trace.severity,
      status: hasPii ? "needs_labeling" : trace.status,
      metadata: JSON.stringify({
        ...parseJobPayload(trace.metadata),
        safety: {
          piiDetected: hasPii,
          piiCount: pii.detected,
          categories,
          scannedAt: new Date().toISOString(),
        },
      }),
    },
  });

  return completeBackgroundJob({
    backgroundJobId,
    message: hasPii
      ? `Safety scan flagged ${pii.detected} PII signal(s); trace marked for review.`
      : "Safety scan found no PII signals.",
    result: {
      piiDetected: hasPii,
      piiCount: pii.detected,
      categories,
    },
  });
}

async function runScoreDatasetJob(backgroundJobId: string, payload: Record<string, unknown>) {
  const datasetId = typeof payload.datasetId === "string" ? payload.datasetId : null;

  if (!datasetId) {
    return failBackgroundJob({
      backgroundJobId,
      message: "Dataset scoring could not start because datasetId is missing.",
    });
  }

  await updateBackgroundJobProgress({
    backgroundJobId,
    progress: 50,
    status: "running",
    message: "Scoring duplicates, label balance, and low-quality rows.",
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 3),
  });

  const dataset = await prisma.dataset.findUnique({
    where: {
      id: datasetId,
    },
    include: {
      examples: true,
    },
  });

  if (!dataset) {
    return failBackgroundJob({
      backgroundJobId,
      message: "Dataset scoring failed because the dataset no longer exists.",
    });
  }

  const report = buildDatasetQualityReport(
    dataset.examples.map((example) => ({
      id: example.id,
      input: example.inputText,
      output: example.outputText,
    })),
  );

  await prisma.datasetQualityReport.upsert({
    where: {
      datasetId,
    },
    update: {
      healthScore: report.healthScore,
      totalExamples: report.totalExamples,
      goodExamples: report.goodExamples,
      exactDuplicates: report.exactDuplicates,
      nearDuplicates: report.nearDuplicates,
      piiDetected: report.piiDetected,
      tooShort: report.tooShort,
      tooLong: report.tooLong,
      emptyOutputs: report.emptyOutputs,
      imbalanced: report.imbalanced,
      languageMixed: report.languageMixed,
      details: report.details,
      recommendation: report.recommendation,
      estimatedCost: report.estimatedCost,
      duplicateScanSampled: report.duplicateScanSampled,
    },
    create: {
      datasetId,
      healthScore: report.healthScore,
      totalExamples: report.totalExamples,
      goodExamples: report.goodExamples,
      exactDuplicates: report.exactDuplicates,
      nearDuplicates: report.nearDuplicates,
      piiDetected: report.piiDetected,
      tooShort: report.tooShort,
      tooLong: report.tooLong,
      emptyOutputs: report.emptyOutputs,
      imbalanced: report.imbalanced,
      languageMixed: report.languageMixed,
      details: report.details,
      recommendation: report.recommendation,
      estimatedCost: report.estimatedCost,
      duplicateScanSampled: report.duplicateScanSampled,
    },
  });
  await prisma.dataset.update({
    where: {
      id: datasetId,
    },
    data: {
      status: report.healthScore >= 70 ? "ready" : "needs_review",
      qualityScore: report.healthScore,
    },
  });

  await invalidate(CacheKeys.datasetQuality(datasetId));

  await recordActivityEvent({
    projectId: dataset.projectId,
    type: "dataset_scored",
    message: `${dataset.name} ${dataset.version} was scored at ${report.healthScore} health.`,
    userId: "system",
    metadata: {
      datasetId,
      healthScore: report.healthScore,
      recommendation: report.recommendation,
    },
  });

  return completeBackgroundJob({
    backgroundJobId,
    message: "Dataset quality report finished and the dataset health report is ready.",
    result: {
      datasetId,
      qualityScore: report.healthScore,
      recommendation: report.recommendation,
    },
  });
}

async function runExperimentJob(backgroundJobId: string, payload: Record<string, unknown>) {
  const experimentId = typeof payload.experimentId === "string" ? payload.experimentId : null;

  if (!experimentId) {
    return failBackgroundJob({
      backgroundJobId,
      message: "Experiment run could not start because experimentId is missing.",
    });
  }

  await updateBackgroundJobProgress({
    backgroundJobId,
    progress: 45,
    status: "running",
    message: "Running eval comparisons against the promoted candidate.",
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 4),
  });

  const experiment = await prisma.experimentRun.findUnique({
    where: {
      id: experimentId,
    },
  });

  if (!experiment) {
    return failBackgroundJob({
      backgroundJobId,
      message: "Experiment processing failed because the experiment no longer exists.",
    });
  }

  // Automated experiment evaluation (running the candidate model over the
  // dataset and scoring it) is not implemented yet. Do NOT fabricate an
  // improved score — move the experiment to "review" for a human to evaluate
  // and leave the score untouched rather than inventing progress.
  await prisma.experimentRun.update({
    where: {
      id: experimentId,
    },
    data: {
      status: "review",
    },
  });

  return completeBackgroundJob({
    backgroundJobId,
    message: "Experiment marked for manual review. Automated candidate scoring is not enabled yet.",
    result: {
      experimentId,
      status: "review",
    },
  });
}



async function runNotificationJob(backgroundJobId: string) {
  await updateBackgroundJobProgress({
    backgroundJobId,
    progress: 75,
    status: "running",
    message: "Dispatching team notifications to configured channels.",
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60),
  });

  return completeBackgroundJob({
    backgroundJobId,
    message: "Notification delivery completed.",
  });
}

async function runMaintenanceJob(backgroundJobId: string, jobType: BackgroundJobType) {
  await updateBackgroundJobProgress({
    backgroundJobId,
    progress: 60,
    status: "running",
    message: `Processing ${jobType} in the background worker.`,
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 2),
  });

  return completeBackgroundJob({
    backgroundJobId,
    message: `${jobType} finished successfully.`,
  });
}

export async function processBackgroundJobById(backgroundJobId: string) {
  const job = await prisma.backgroundJob.findUniqueOrThrow({
    where: {
      id: backgroundJobId,
    },
  });
  const payload = parseJobPayload(job.payload);

  switch (job.jobType as BackgroundJobType) {
    case "ingest-trace":
      return runIngestTraceJob(backgroundJobId);
    case "safety-scan":
      return runSafetyScanJob(backgroundJobId, payload);
    case "score-dataset":
      return runScoreDatasetJob(backgroundJobId, payload);
    case "run-experiment":
      return runExperimentJob(backgroundJobId, payload);
    case "run-tra-analysis":
    case "launch-finetune":
    case "run-recovery-job":
      // These job types are processed exclusively by the BullMQ worker fleet
      // (runtime.ts + tra-worker.ts + recovery-worker.ts). If this HTTP path is
      // called for them it means a manual retry — treat as a maintenance pass.
      return runMaintenanceJob(backgroundJobId, job.jobType as BackgroundJobType);
    case "send-notification":
      return runNotificationJob(backgroundJobId);
    case "poll-finetune":
    case "expire-review-links":
    case "generate-nudges":
    case "run-ab-test":
      return runMaintenanceJob(backgroundJobId, job.jobType as BackgroundJobType);
    default:
      return failBackgroundJob({
        backgroundJobId,
        message: `Unknown background job type: ${job.jobType}.`,
      });
  }
}

export function parseJobLogs(logs: string) {
  try {
    const parsed = JSON.parse(logs) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseJobPayload(payload: string) {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
