import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { Queue, type Job } from "bullmq";
import { Resend } from "resend";
import { z } from "zod";
import {
  completeBackgroundJob,
  enqueueBackgroundJob,
  failBackgroundJob,
  getBackgroundJobQueue,
  getQueueNameForJobType,
  type BackgroundJobType,
  updateBackgroundJobProgress,
} from "../lib/background-jobs";
import { incrementTraceUsage } from "../lib/billing-data";
import { CacheKeys, invalidate } from "../lib/cache";
import { getServerEnv } from "../lib/env";
import { getActiveCredential } from "../lib/provider-credentials";
import { prisma } from "../lib/prisma";
import { getQueueStats } from "../lib/queue-monitor";
import { initializeSentry, Sentry } from "../lib/sentry";
import { buildDatasetQualityReport, checkPiiDetection } from "../lib/quality-engine";
import { sendSlackMessage, type SlackMessage } from "../lib/slack";
import { recordActivityEvent } from "../lib/workspace-data";
import { workerLogger } from "./logger";

const env = getServerEnv();
const POLL_TIMEOUT_COUNT = 2000;
const NOTIFICATION_DEDUPE_WINDOW_MS = 86_400_000;

const tracePayloadSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(8),
  source: z.string().min(3),
  inputText: z.string().min(1).optional(),
  outputText: z.string().optional(),
  modelName: z.string().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  metadata: z.string().optional(),
  tags: z.string().optional(),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
});

export type WorkerJobData = {
  backgroundJobId: string;
  organizationId: string;
  projectId?: string | null;
  payload?: Record<string, unknown>;
};

export type NotificationKind =
  | "finetune_completed"
  | "finetune_failed"
  | "dataset_low_quality"
  | "usage_at_80_percent";

export type WorkerLike = {
  name: string;
  close: () => Promise<void>;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected worker failure";
}

function parsePayloadObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function buildFineTuneJsonl(examples: Array<{ inputText: string; outputText: string | null }>) {
  return examples
    .filter((example) => example.outputText && example.outputText.trim().length > 0)
    .map((example) =>
      JSON.stringify({
        messages: [
          { role: "user", content: example.inputText },
          { role: "assistant", content: example.outputText },
        ],
      }),
    )
    .join("\n");
}

function createOpenAiClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    timeout: 5_000,
  });
}

function createJsonlFile(jsonlContent: string) {
  return new File([jsonlContent], "training.jsonl", {
    type: "application/jsonl",
  });
}

function extractValidationLoss(resultFiles: unknown): number | null {
  if (!Array.isArray(resultFiles)) {
    return null;
  }

  for (const resultFile of resultFiles) {
    if (!resultFile || typeof resultFile !== "object") {
      continue;
    }

    const fileRecord = resultFile as {
      validation_loss?: unknown;
      metrics?: { validation_loss?: unknown };
    };

    if (typeof fileRecord.validation_loss === "number") {
      return fileRecord.validation_loss;
    }

    if (typeof fileRecord.metrics?.validation_loss === "number") {
      return fileRecord.metrics.validation_loss;
    }
  }

  return null;
}

function getNotificationReferenceId(payload: Record<string, unknown>, fallbackId: string) {
  const referenceId = payload.trainingJobId ?? payload.datasetId ?? payload.releaseId;
  return typeof referenceId === "string" && referenceId.length > 0 ? referenceId : fallbackId;
}

async function sendEmail(input: {
  to: string[];
  subject: string;
  html: string;
}) {
  if (input.to.length === 0) {
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
}

async function getNotificationRecipients(organizationId: string, kind: NotificationKind) {
  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
    include: {
      users: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!organization) {
    return [];
  }

  if (kind === "dataset_low_quality") {
    return organization.users.filter((user) => user.role === "engineer").map((user) => user.email);
  }

  if (kind === "usage_at_80_percent") {
    return organization.users.filter((user) => user.role === "owner").map((user) => user.email);
  }

  return organization.users
    .filter((user) => user.role === "owner" || user.role === "admin")
    .map((user) => user.email);
}

function buildNotificationContent(type: NotificationKind, payload: Record<string, unknown>) {
  const subjectMap: Record<NotificationKind, string> = {
    finetune_completed: "Your FinetuneOps fine-tune completed",
    finetune_failed: "Your FinetuneOps fine-tune failed",
    dataset_low_quality: "A dataset needs cleanup before training",
    usage_at_80_percent: "Your FinetuneOps workspace is nearing its trace limit",
  };
  const htmlMap: Record<NotificationKind, string> = {
    finetune_completed: `<p>Your fine-tune completed successfully.</p>`,
    finetune_failed: `<p>Your fine-tune failed. ${String(payload.errorMessage ?? "")}</p>`,
    dataset_low_quality: `<p>A dataset scored below 50 and should be cleaned before training.</p>`,
    usage_at_80_percent: `<p>Your workspace has reached 80% of its trace allowance.</p>`,
  };

  return {
    subject: subjectMap[type],
    html: htmlMap[type],
  };
}

function buildSlackNotificationMessage(
  type: NotificationKind,
  payload: Record<string, unknown>,
): SlackMessage | null {
  switch (type) {
    case "finetune_completed":
      return {
        type,
        jobName: String(payload.jobName ?? "Fine-tune job"),
        modelId: String(payload.modelId ?? "OpenAI fine-tune"),
        trainedTokens: Number(payload.trainedTokens ?? 0),
        path: "/jobs",
      };
    case "finetune_failed":
      return {
        type,
        jobName: String(payload.jobName ?? "Fine-tune job"),
        errorMessage: String(payload.errorMessage ?? "Unknown training failure"),
        path: "/jobs",
      };
    case "dataset_low_quality":
      return {
        type,
        datasetName: String(payload.datasetName ?? "Dataset"),
        healthScore: Number(payload.healthScore ?? 0),
        issuesSummary: String(payload.issuesSummary ?? payload.recommendation ?? "Review the quality report"),
        path: typeof payload.datasetId === "string" ? `/datasets/${payload.datasetId}` : "/datasets",
      };
    default:
      return null;
  }
}

async function runWorkerJob<T>(
  workerName: string,
  job: Job<WorkerJobData>,
  handler: (job: Job<WorkerJobData>) => Promise<T>,
) {
  initializeSentry();
  workerLogger.info({
    event: "worker_job_started",
    workerName,
    jobId: job.data.backgroundJobId,
    queueJobId: job.id ?? "unknown",
    workspaceId: job.data.organizationId,
  });

  try {
    const result = await handler(job);
    workerLogger.info({
      event: "worker_job_completed",
      workerName,
      jobId: job.data.backgroundJobId,
      queueJobId: job.id ?? "unknown",
      workspaceId: job.data.organizationId,
    });
    return result;
  } catch (error) {
    const message = getErrorMessage(error);
    workerLogger.error({
      event: "worker_job_failed",
      workerName,
      jobId: job.data.backgroundJobId,
      queueJobId: job.id ?? "unknown",
      workspaceId: job.data.organizationId,
      error: message,
    });
    Sentry.captureException(error, {
      tags: {
        workerName,
        jobType: job.name,
      },
      extra: {
        backgroundJobId: job.data.backgroundJobId,
        workspaceId: job.data.organizationId,
      },
    });

    if (job.data?.backgroundJobId) {
      await failBackgroundJob({
        backgroundJobId: job.data.backgroundJobId,
        message,
      });
    }

    throw error;
  }
}

export async function handleIngestTraceJob(job: Job<WorkerJobData>) {
  return runWorkerJob("ingest-trace", job, async (currentJob) => {
    const payload = parsePayloadObject(currentJob.data.payload);
    const traceInput = payload.trace ?? payload;
    const parsed = tracePayloadSchema.safeParse(traceInput);

    if (!parsed.success) {
      await failBackgroundJob({
        backgroundJobId: currentJob.data.backgroundJobId,
        message: "Trace payload validation failed.",
      });
      throw new Error("Trace payload validation failed");
    }

    await updateBackgroundJobProgress({
      backgroundJobId: currentJob.data.backgroundJobId,
      progress: 30,
      status: "running",
      message: "Validating trace payload and checking for risky PII.",
      estimatedCompletionAt: new Date(Date.now() + 1000 * 45),
    });

    const safety = checkPiiDetection([
      {
        id: "pending",
        input: parsed.data.inputText ?? parsed.data.title,
        output: parsed.data.outputText ?? "",
      },
    ]);

    const trace = await prisma.traceEvent.create({
      data: {
        projectId: parsed.data.projectId,
        title: parsed.data.title,
        source: parsed.data.source,
        inputText: parsed.data.inputText ?? parsed.data.title,
        outputText: parsed.data.outputText ?? "",
        modelName: parsed.data.modelName ?? "unknown",
        latencyMs: parsed.data.latencyMs ?? 0,
        metadata: parsed.data.metadata ?? JSON.stringify({ piiDetected: safety.detected > 0 }),
        tags: parsed.data.tags ?? JSON.stringify(["worker-ingested"]),
        severity: parsed.data.severity,
        status: safety.detected > 0 ? "needs_labeling" : "triaged",
      },
    });

    await incrementTraceUsage(currentJob.data.organizationId);
    await recordActivityEvent({
      projectId: trace.projectId,
      type: "trace_captured",
      message: `${trace.title} was ingested by the background worker.`,
      userId: "system",
      metadata: {
        traceId: trace.id,
      },
    });

    return completeBackgroundJob({
      backgroundJobId: currentJob.data.backgroundJobId,
      message: "Trace ingestion saved the payload and updated workspace usage.",
      result: {
        traceId: trace.id,
        piiDetected: safety.detected > 0,
      },
    });
  });
}

export async function handleScoreDatasetJob(job: Job<WorkerJobData>) {
  return runWorkerJob("score-dataset", job, async (currentJob) => {
    const datasetId = typeof currentJob.data.payload?.datasetId === "string"
      ? currentJob.data.payload.datasetId
      : null;

    if (!datasetId) {
      await failBackgroundJob({
        backgroundJobId: currentJob.data.backgroundJobId,
        message: "Dataset scoring could not start because datasetId is missing.",
      });
      throw new Error("Dataset scoring requires datasetId");
    }

    await updateBackgroundJobProgress({
      backgroundJobId: currentJob.data.backgroundJobId,
      progress: 35,
      status: "running",
      message: "Running duplicate, PII, and language checks.",
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 3),
    });

    const dataset = await prisma.dataset.findUnique({
      where: {
        id: datasetId,
      },
      include: {
        examples: true,
        project: true,
      },
    });

    if (!dataset) {
      await failBackgroundJob({
        backgroundJobId: currentJob.data.backgroundJobId,
        message: "Dataset scoring failed because the dataset no longer exists.",
      });
      throw new Error("Dataset not found");
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

    if (report.healthScore < 50) {
      await enqueueBackgroundJob({
        organizationId: currentJob.data.organizationId,
        projectId: dataset.projectId,
        jobType: "send-notification",
        payload: {
          type: "dataset_low_quality",
          datasetId,
          recommendation: report.recommendation,
        },
      });
    }

    await recordActivityEvent({
      projectId: dataset.projectId,
      type: "dataset_scored",
      message: `${dataset.name} ${dataset.version} scored ${report.healthScore}/100.`,
      userId: "system",
      metadata: {
        datasetId,
        healthScore: report.healthScore,
      },
    });

    return completeBackgroundJob({
      backgroundJobId: currentJob.data.backgroundJobId,
      message: "Dataset quality report finished and is now available in the workspace.",
      result: {
        datasetId,
        healthScore: report.healthScore,
      },
    });
  });
}

export async function handleLaunchFineTuneJob(job: Job<WorkerJobData>) {
  return runWorkerJob("launch-finetune", job, async (currentJob) => {
    const trainingJobId = typeof currentJob.data.payload?.trainingJobId === "string"
      ? currentJob.data.payload.trainingJobId
      : null;

    if (!trainingJobId) {
      throw new Error("trainingJobId is required");
    }

    const apiKey = await getActiveCredential(currentJob.data.organizationId, "openai");
    if (!apiKey) {
      await prisma.trainingJob.update({
        where: {
          id: trainingJobId,
        },
        data: {
          status: "failed",
          errorMessage: "No OpenAI key configured",
          finishedAt: new Date(),
          progressNote: "No OpenAI key configured",
        },
      });
      throw new Error("No OpenAI key configured");
    }

    await updateBackgroundJobProgress({
      backgroundJobId: currentJob.data.backgroundJobId,
      progress: 25,
      status: "running",
      message: "Exporting dataset examples to OpenAI JSONL format.",
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 8),
    });

    const trainingJob = await prisma.trainingJob.findFirst({
      where: {
        id: trainingJobId,
        project: {
          organizationId: currentJob.data.organizationId,
        },
      },
      include: {
        dataset: {
          include: {
            examples: true,
          },
        },
        project: true,
      },
    });

    if (!trainingJob || !trainingJob.dataset) {
      await prisma.trainingJob.update({
        where: {
          id: trainingJobId,
        },
        data: {
          status: "failed",
          errorMessage: "Fine-tune launch failed because the dataset could not be loaded.",
          finishedAt: new Date(),
          progressNote: "Dataset missing",
        },
      });
      throw new Error("Training job dataset missing");
    }

    if (trainingJob.dataset.examples.length === 0) {
      await prisma.trainingJob.update({
        where: {
          id: trainingJobId,
        },
        data: {
          status: "failed",
          errorMessage: "Dataset has no examples to fine-tune on",
          finishedAt: new Date(),
          progressNote: "Dataset has no examples",
        },
      });
      throw new Error("Dataset has no examples to fine-tune on");
    }

    const jsonlContent = buildFineTuneJsonl(trainingJob.dataset.examples);
    if (jsonlContent.trim().length === 0) {
      await prisma.trainingJob.update({
        where: {
          id: trainingJobId,
        },
        data: {
          status: "failed",
          errorMessage: "Dataset has no valid input/output examples",
          finishedAt: new Date(),
          progressNote: "Dataset has no valid examples",
        },
      });
      throw new Error("Dataset has no valid input/output examples");
    }

    const qualityReport = trainingJob.datasetId
      ? await prisma.datasetQualityReport.findUnique({
          where: {
            datasetId: trainingJob.datasetId,
          },
        })
      : null;

    const qualityWarning = qualityReport && qualityReport.healthScore < 50
      ? `Warning: dataset scored ${qualityReport.healthScore}/100.`
      : null;

    const openai = createOpenAiClient(apiKey);
    const uploadedFile = await openai.files.create({
      file: createJsonlFile(jsonlContent),
      purpose: "fine-tune",
    });
    const fineTuneJob = await openai.fineTuning.jobs.create({
      training_file: uploadedFile.id,
      model: trainingJob.modelBase || "gpt-4o-mini",
    });

    await prisma.trainingJob.update({
      where: {
        id: trainingJobId,
      },
      data: {
        provider: "OpenAI",
        status: "running",
        progress: 15,
        openaiFileId: uploadedFile.id,
        openaiJobId: fineTuneJob.id,
        providerJobId: fineTuneJob.id,
        pollCount: 0,
        checkpoint: `OpenAI training file ${uploadedFile.id}`,
        progressNote: qualityWarning
          ? `${qualityWarning} Submitted to OpenAI.`
          : "Submitted to OpenAI.",
        startedAt: new Date(),
        errorMessage: null,
        providerMetadata: {
          trainingFileId: uploadedFile.id,
          initialStatus: fineTuneJob.status,
          qualityWarning,
        },
      },
    });

    workerLogger.info({
      event: "finetune_submitted",
      workspaceId: currentJob.data.organizationId,
      jobId: trainingJobId,
      openaiJobId: fineTuneJob.id,
    });

    await enqueueBackgroundJob({
      organizationId: currentJob.data.organizationId,
      projectId: trainingJob.projectId,
      jobType: "poll-finetune",
      payload: {
        trainingJobId,
      },
      delayMs: 60_000,
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60),
    });

    return completeBackgroundJob({
      backgroundJobId: currentJob.data.backgroundJobId,
      message: "Fine-tune was submitted to OpenAI and polling has started.",
      result: {
        trainingJobId,
        openaiJobId: fineTuneJob.id,
      },
    });
  });
}

export async function handlePollFineTuneJob(job: Job<WorkerJobData>) {
  return runWorkerJob("poll-finetune", job, async (currentJob) => {
    const trainingJobId = typeof currentJob.data.payload?.trainingJobId === "string"
      ? currentJob.data.payload.trainingJobId
      : null;

    if (!trainingJobId) {
      throw new Error("trainingJobId is required");
    }

    const dbJob = await prisma.trainingJob.findFirst({
      where: {
        id: trainingJobId,
        project: {
          organizationId: currentJob.data.organizationId,
        },
      },
      include: {
        project: true,
      },
    });

    if (!dbJob) {
      workerLogger.warn({
        event: "poll_skipped",
        reason: "job_not_found",
        jobId: trainingJobId,
        workspaceId: currentJob.data.organizationId,
      });
      return;
    }

    if (dbJob.status === "cancelled") {
      workerLogger.info({
        event: "poll_skipped",
        reason: "job_cancelled",
        jobId: trainingJobId,
        workspaceId: currentJob.data.organizationId,
      });
      return;
    }

    const incrementedJob = await prisma.trainingJob.update({
      where: {
        id: dbJob.id,
      },
      data: {
        pollCount: {
          increment: 1,
        },
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        openaiJobId: true,
        pollCount: true,
      },
    });

    if (incrementedJob.pollCount > POLL_TIMEOUT_COUNT) {
      const errorMessage = "Polling timeout after 33 hours";
      await prisma.trainingJob.update({
        where: {
          id: incrementedJob.id,
        },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage,
          progressNote: errorMessage,
        },
      });
      await enqueueBackgroundJob({
        organizationId: currentJob.data.organizationId,
        projectId: incrementedJob.projectId,
        jobType: "send-notification",
        payload: {
          type: "finetune_failed",
          trainingJobId,
          errorMessage,
        },
      });
      await failBackgroundJob({
        backgroundJobId: currentJob.data.backgroundJobId,
        message: errorMessage,
      });
      return {
        failed: true,
      };
    }

    if (!incrementedJob.openaiJobId) {
      throw new Error("OpenAI job id missing");
    }

    const apiKey = await getActiveCredential(currentJob.data.organizationId, "openai");
    if (!apiKey) {
      throw new Error("No OpenAI key configured");
    }

    await updateBackgroundJobProgress({
      backgroundJobId: currentJob.data.backgroundJobId,
      progress: 45,
      status: "running",
      message: "Polling OpenAI fine-tune status.",
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60),
    });

    const openai = createOpenAiClient(apiKey);
    const fineTuneJob = await openai.fineTuning.jobs.retrieve(incrementedJob.openaiJobId);

    if (["validating_files", "queued", "running"].includes(fineTuneJob.status)) {
      await prisma.trainingJob.update({
        where: {
          id: incrementedJob.id,
        },
        data: {
          status: "running",
          progress: 45,
          progressNote: `OpenAI status: ${fineTuneJob.status}`,
          providerMetadata: {
            fineTuneStatus: fineTuneJob.status,
            trainedTokens: fineTuneJob.trained_tokens ?? 0,
          },
        },
      });

      await enqueueBackgroundJob({
        organizationId: currentJob.data.organizationId,
        projectId: incrementedJob.projectId,
        jobType: "poll-finetune",
        payload: {
          trainingJobId,
        },
        delayMs: 60_000,
        estimatedCompletionAt: new Date(Date.now() + 1000 * 60),
      });

      return completeBackgroundJob({
        backgroundJobId: currentJob.data.backgroundJobId,
        message: "Fine-tune is still running; another polling cycle was queued.",
        result: {
          trainingJobId,
          status: fineTuneJob.status,
          pollCount: incrementedJob.pollCount,
        },
      });
    }

    if (fineTuneJob.status === "succeeded") {
      const validationLoss = extractValidationLoss(fineTuneJob.result_files);
      await prisma.trainingJob.update({
        where: {
          id: incrementedJob.id,
        },
        data: {
          status: "completed",
          progress: 100,
          completedModelId: fineTuneJob.fine_tuned_model ?? null,
          fineTunedModelId: fineTuneJob.fine_tuned_model ?? null,
          trainedTokens: fineTuneJob.trained_tokens ?? null,
          validationLoss,
          finishedAt: new Date(),
          errorMessage: null,
          progressNote: "Training complete",
          providerMetadata: {
            fineTuneStatus: fineTuneJob.status,
            trainedTokens: fineTuneJob.trained_tokens ?? 0,
            resultFiles: fineTuneJob.result_files ?? [],
            validationLoss,
          },
        },
      });

      await enqueueBackgroundJob({
        organizationId: currentJob.data.organizationId,
        projectId: incrementedJob.projectId,
        jobType: "send-notification",
        payload: {
          type: "finetune_completed",
          trainingJobId,
        },
      });

      await recordActivityEvent({
        projectId: incrementedJob.projectId,
        type: "fine_tune_completed",
        message: `${incrementedJob.name} completed successfully and is ready for review.`,
        userId: "system",
        metadata: {
          trainingJobId,
          providerJobId: incrementedJob.openaiJobId,
        },
      });

      return completeBackgroundJob({
        backgroundJobId: currentJob.data.backgroundJobId,
        message: "Fine-tune polling confirmed the run completed successfully.",
        result: {
          trainingJobId,
          modelId: fineTuneJob.fine_tuned_model ?? null,
        },
      });
    }

    if (fineTuneJob.status === "cancelled") {
      await prisma.trainingJob.update({
        where: {
          id: incrementedJob.id,
        },
        data: {
          status: "cancelled",
          finishedAt: new Date(),
          progressNote: "Training cancelled",
          providerMetadata: {
            fineTuneStatus: fineTuneJob.status,
          },
        },
      });

      return completeBackgroundJob({
        backgroundJobId: currentJob.data.backgroundJobId,
        message: "Fine-tune polling confirmed the run was cancelled.",
        result: {
          trainingJobId,
          status: "cancelled",
        },
      });
    }

    const errorMessage = fineTuneJob.error?.message ?? "Fine-tune failed";
    await prisma.trainingJob.update({
      where: {
        id: incrementedJob.id,
      },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage,
        progressNote: errorMessage,
        providerMetadata: {
          fineTuneStatus: fineTuneJob.status,
        },
      },
    });

    await enqueueBackgroundJob({
      organizationId: currentJob.data.organizationId,
      projectId: incrementedJob.projectId,
      jobType: "send-notification",
      payload: {
        type: "finetune_failed",
        trainingJobId,
        errorMessage,
      },
    });

    await recordActivityEvent({
      projectId: incrementedJob.projectId,
      type: "fine_tune_failed",
      message: `${incrementedJob.name} failed in OpenAI with: ${errorMessage}`,
      userId: "system",
      metadata: {
        trainingJobId,
      },
    });

    await failBackgroundJob({
      backgroundJobId: currentJob.data.backgroundJobId,
      message: errorMessage,
    });

    return {
      failed: true,
    };
  });
}

export async function handleSendNotificationJob(job: Job<WorkerJobData>) {
  return runWorkerJob("send-notification", job, async (currentJob) => {
    const payload = parsePayloadObject(currentJob.data.payload);
    const type = payload.type as NotificationKind | undefined;

    if (!type) {
      throw new Error("Notification type is required");
    }

    await updateBackgroundJobProgress({
      backgroundJobId: currentJob.data.backgroundJobId,
      progress: 70,
      status: "running",
      message: "Sending transactional notification email.",
      estimatedCompletionAt: new Date(Date.now() + 1000 * 30),
    });

    const referenceId = getNotificationReferenceId(payload, currentJob.data.backgroundJobId);
    const existingNotification = await prisma.notificationLog.findFirst({
      where: {
        workspaceId: currentJob.data.organizationId,
        type,
        referenceId,
        sentAt: {
          gte: new Date(Date.now() - NOTIFICATION_DEDUPE_WINDOW_MS),
        },
      },
    });

    if (existingNotification) {
      workerLogger.info({
        event: "notification_skipped",
        reason: "duplicate",
        workspaceId: currentJob.data.organizationId,
        jobId: currentJob.data.backgroundJobId,
      });

      return completeBackgroundJob({
        backgroundJobId: currentJob.data.backgroundJobId,
        message: "Notification skipped because a matching send already happened within 24 hours.",
        result: {
          type,
          duplicate: true,
        },
      });
    }

    const recipients = await getNotificationRecipients(currentJob.data.organizationId, type);
    const notificationContent = buildNotificationContent(type, payload);

    await sendEmail({
      to: recipients,
      subject: notificationContent.subject,
      html: notificationContent.html,
    });

    const slackMessage = buildSlackNotificationMessage(type, payload);
    if (slackMessage) {
      try {
        await sendSlackMessage(currentJob.data.organizationId, slackMessage);
      } catch (error) {
        workerLogger.error({
          event: "notification_slack_failed",
          workspaceId: currentJob.data.organizationId,
          jobId: currentJob.data.backgroundJobId,
          error: getErrorMessage(error),
        });
      }
    }

    await prisma.notificationLog.create({
      data: {
        workspaceId: currentJob.data.organizationId,
        type,
        referenceId,
      },
    });

    return completeBackgroundJob({
      backgroundJobId: currentJob.data.backgroundJobId,
      message: "Notification email delivered successfully.",
      result: {
        type,
        recipients: recipients.length,
      },
    });
  });
}

export async function handleGenericBackgroundJob(job: Job<WorkerJobData>) {
  return runWorkerJob(job.name, job, async (currentJob) => {
    await updateBackgroundJobProgress({
      backgroundJobId: currentJob.data.backgroundJobId,
      progress: 60,
      status: "running",
      message: `Processing ${currentJob.name} in the worker fleet.`,
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60),
    });

    return completeBackgroundJob({
      backgroundJobId: currentJob.data.backgroundJobId,
      message: `${currentJob.name} completed in the worker fleet.`,
    });
  });
}

export function createWorkerProcessor(jobType: BackgroundJobType) {
  switch (jobType) {
    case "ingest-trace":
      return handleIngestTraceJob;
    case "score-dataset":
      return handleScoreDatasetJob;
    case "launch-finetune":
      return handleLaunchFineTuneJob;
    case "poll-finetune":
      return handlePollFineTuneJob;
    case "send-notification":
      return handleSendNotificationJob;
    default:
      return handleGenericBackgroundJob;
  }
}

export async function gracefulShutdown(input: {
  workers: WorkerLike[];
  server?: Server | null;
  timeoutMs?: number;
}) {
  const timeoutMs = input.timeoutMs ?? 30_000;

  await Promise.race([
    Promise.all(input.workers.map((worker) => worker.close())),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);

  if (input.server) {
    await new Promise<void>((resolve) => {
      input.server?.close(() => resolve());
    });
  }
}

export function createWorkerHealthServer(workerNames: readonly string[], port = 3002) {
  const startedAt = Date.now();
  const server = createServer(async (request, response) => {
    if (request.url !== "/health") {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }

    const queueStats = await getQueueStats();
    const alerts = queueStats
      .filter((queue) => queue.level !== "ok")
      .map((queue) => `${queue.name}:${queue.level}`);
    const queues = Object.fromEntries(
      queueStats.map((queue) => [
        queue.name,
        {
          waiting: queue.waiting,
          active: queue.active,
          level: queue.level,
        },
      ]),
    );

    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        status: alerts.some((alert) => alert.endsWith(":critical")) ? "degraded" : "ok",
        uptime: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
        workers: workerNames,
        queues,
        alerts,
      }),
    );
  });

  server.listen(port);
  workerLogger.info({
    event: "worker_health_server_started",
    port,
  });

  return server;
}

export function getWorkerQueueNames(jobTypes: readonly BackgroundJobType[]) {
  return jobTypes.map((jobType) => getQueueNameForJobType(jobType));
}

export async function getWorkerHealthSnapshot(jobTypes: readonly BackgroundJobType[]) {
  const snapshots = await getQueueStats();

  return snapshots.filter((snapshot) => jobTypes.includes(snapshot.name as BackgroundJobType));
}


