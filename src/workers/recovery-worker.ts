import type { Job } from "bullmq";
import {
  completeBackgroundJob,
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

  const originalDatasetId = traReport.regressionAlert.candidateRun.dataset.id;

  const recoveryJob = await prisma.recoveryJob.create({
    data: {
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

    await prisma.recoveryJob.update({
      where: { id: recoveryJob.id },
      data: {
        status: "COMPLETE",
        newDatasetId: result.newDatasetId,
        removedExampleCount: result.removedCount,
        completedAt: new Date(),
      },
    });

    await sendSlackMessage(job.data.organizationId, {
      type: "recovery_completed",
      datasetId: result.newDatasetId,
      removedCount: result.removedCount,
      path: `/datasets/${result.newDatasetId}`,
    });

    return completeBackgroundJob({
      backgroundJobId: job.data.backgroundJobId,
      message: `Recovery completed. Removed ${result.removedCount} examples.`,
      result,
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
