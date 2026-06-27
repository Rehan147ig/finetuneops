import type { Job } from "bullmq";
import {
  completeBackgroundJob,
  enqueueBackgroundJob,
  failBackgroundJob,
  updateBackgroundJobProgress,
} from "@/lib/background-jobs";
import { prisma } from "@/lib/prisma";
import { sendSlackMessage } from "@/lib/slack";
import { runRecovery } from "@/lib/recovery-engine";
import type { WorkerJobData } from "./runtime";
import { workerLogger } from "./logger";

export async function handleRunRecoveryJob(job: Job<WorkerJobData>) {
  const traReportId = typeof job.data.payload?.traReportId === "string"
    ? job.data.payload.traReportId
    : null;

  if (!traReportId) {
    await failBackgroundJob({
      backgroundJobId: job.data.backgroundJobId,
      message: "Recovery failed because traReportId is missing.",
    });
    throw new Error("traReportId is required");
  }

  const traReport = await prisma.traReport.findUnique({
    where: { id: traReportId },
    include: {
      regressionAlert: {
        include: {
          candidateRun: {
            include: {
              dataset: true,
              trainingJob: true,
            }
          }
        }
      }
    }
  });

  if (!traReport || !traReport.regressionAlert.candidateRun.dataset) {
    await failBackgroundJob({
      backgroundJobId: job.data.backgroundJobId,
      message: "Recovery failed because the original dataset could not be found.",
    });
    throw new Error("Original dataset not found");
  }

  const originalDataset = traReport.regressionAlert.candidateRun.dataset;
  const originalDatasetId = originalDataset.id;

  const recoveryJob = await prisma.recoveryJob.upsert({
    where: { traReportId },
    update: {},
    create: {
      traReportId,
      originalDatasetId,
      status: "PENDING",
    },
  });

  try {
    await updateBackgroundJobProgress({
      backgroundJobId: job.data.backgroundJobId,
      progress: 20,
      status: "running",
      message: "Running dataset recovery process to remove suspicious examples.",
    });

    await prisma.recoveryJob.update({
      where: { id: recoveryJob.id },
      data: { status: "RUNNING" },
    });

    const result = await runRecovery(traReportId);

    await updateBackgroundJobProgress({
      backgroundJobId: job.data.backgroundJobId,
      progress: 70,
      status: "running",
      message: "Clean dataset built. Queuing quality check and retrain.",
    });

    // 1) Score the clean dataset so the quality gate reflects the recovery.
    await enqueueBackgroundJob({
      organizationId: job.data.organizationId,
      projectId: job.data.projectId ?? null,
      jobType: "score-dataset",
      payload: { datasetId: result.newDatasetId },
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 3),
    });

    // 2) Create a retrain job on the clean dataset, copying the original
    //    candidate's model base + provider so the comparison is apples-to-apples.
    const candidateTrainingJob = traReport.regressionAlert.candidateRun.trainingJob;
    const retrainJob = await prisma.trainingJob.create({
      data: {
        projectId: originalDataset.projectId,
        datasetId: result.newDatasetId,
        name: `${candidateTrainingJob?.name ?? "Fine-tune"} — recovered retrain`,
        modelBase: candidateTrainingJob?.modelBase ?? "gpt-4o-mini",
        provider: candidateTrainingJob?.provider ?? "OpenAI",
        status: "queued",
      },
    });

    // 3) Link the retrain job on the recovery record and mark RETRAINING so the
    //    UI can show "retrain in progress" with a link to the job. The launch →
    //    poll → auto-eval → regression-retest chain runs automatically afterwards.
    await prisma.recoveryJob.update({
      where: { id: recoveryJob.id },
      data: {
        status: "RETRAINING",
        newDatasetId: result.newDatasetId,
        removedExampleCount: result.removedCount,
        retrainJobId: retrainJob.id,
        completedAt: new Date(),
      },
    });

    await enqueueBackgroundJob({
      organizationId: job.data.organizationId,
      projectId: job.data.projectId ?? null,
      jobType: "launch-finetune",
      payload: { trainingJobId: retrainJob.id },
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 10),
    });

    await sendSlackMessage(job.data.organizationId, {
      type: "recovery_completed",
      datasetId: result.newDatasetId,
      removedCount: result.removedCount,
      path: `/datasets/${result.newDatasetId}`,
    });

    return completeBackgroundJob({
      backgroundJobId: job.data.backgroundJobId,
      message: `Recovery completed. Removed ${result.removedCount} examples and queued a retrain on the clean dataset.`,
      result: { ...result, retrainJobId: retrainJob.id },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    await prisma.recoveryJob.update({
      where: { id: recoveryJob.id },
      data: {
        status: "FAILED",
        error: errorMessage,
        completedAt: new Date(),
      },
    });

    workerLogger.error({
      event: "recovery_failed",
      traReportId,
      error: errorMessage,
    });

    await failBackgroundJob({
      backgroundJobId: job.data.backgroundJobId,
      message: errorMessage,
    });
    throw error;
  }
}
