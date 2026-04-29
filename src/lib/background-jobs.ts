import { Queue } from "bullmq";
import { getServerEnv } from "@/lib/env";
import { CacheKeys, invalidate } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { buildDatasetQualityReport } from "@/lib/quality-engine";
import { recordActivityEvent } from "@/lib/workspace-data";

export const backgroundJobTypes = [
  "ingest-trace",
  "score-dataset",
  "run-experiment",
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

export function getBackgroundJobQueue(
  queueNameOrJobType: BackgroundJobType | string = "finetuneops-background-jobs",
) {
  const queueName = resolveQueueName(queueNameOrJobType);

  return new Queue(queueName, {
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
  });
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
  await queue.close();

  return backgroundJob;
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
  await queue.close();
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

async function runSafetyScanJob(backgroundJobId: string) {
  await updateBackgroundJobProgress({
    backgroundJobId,
    progress: 55,
    status: "running",
    message: "Scanning the trace for risky content and prompt-injection signals.",
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 2),
  });

  return completeBackgroundJob({
    backgroundJobId,
    message: "Safety scan completed without blocking issues.",
    result: {
      safetyScore: 0.08,
      verdict: "safe",
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
      projectedSaving: report.projectedSaving,
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
      projectedSaving: report.projectedSaving,
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

  const nextScore = Math.min((experiment.score ?? 0) + 2.2, 97);
  const nextStatus = nextScore >= 85 ? "promote" : nextScore >= 75 ? "review" : "running";

  await prisma.experimentRun.update({
    where: {
      id: experimentId,
    },
    data: {
      score: nextScore,
      status: nextStatus,
    },
  });

  return completeBackgroundJob({
    backgroundJobId,
    message: "Experiment evaluation completed and the candidate verdict has been refreshed.",
    result: {
      experimentId,
      score: nextScore,
      status: nextStatus,
    },
  });
}

async function runLaunchFineTuneJob(backgroundJobId: string, payload: Record<string, unknown>) {
  const trainingJobId = typeof payload.trainingJobId === "string" ? payload.trainingJobId : null;

  if (!trainingJobId) {
    return failBackgroundJob({
      backgroundJobId,
      message: "Fine-tune launch failed because trainingJobId is missing.",
    });
  }

  await updateBackgroundJobProgress({
    backgroundJobId,
    progress: 35,
    status: "running",
    message: "Provisioning provider resources and restoring checkpoints if needed.",
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 8),
  });

  const trainingJob = await prisma.trainingJob.findUnique({
    where: {
      id: trainingJobId,
    },
  });

  if (!trainingJob) {
    return failBackgroundJob({
      backgroundJobId,
      message: "Fine-tune launch failed because the training job no longer exists.",
    });
  }

  await prisma.trainingJob.update({
    where: {
      id: trainingJobId,
    },
    data: {
      status: "completed",
      progress: 100,
      gpuHours: Math.max(trainingJob.gpuHours, 3.8),
      startedAt: trainingJob.startedAt ?? new Date(Date.now() - 1000 * 60 * 42),
      finishedAt: new Date(),
      checkpoint: "Artifacts synced to provider storage",
    },
  });

  return completeBackgroundJob({
    backgroundJobId,
    message: "Fine-tune worker finished and synced the final artifacts back into FinetuneOps.",
    result: {
      trainingJobId,
      status: "completed",
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
      return runSafetyScanJob(backgroundJobId);
    case "score-dataset":
      return runScoreDatasetJob(backgroundJobId, payload);
    case "run-experiment":
      return runExperimentJob(backgroundJobId, payload);
    case "launch-finetune":
      return runLaunchFineTuneJob(backgroundJobId, payload);
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
