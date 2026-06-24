import type { Job } from "bullmq";
import {
  completeBackgroundJob,
  failBackgroundJob,
  updateBackgroundJobProgress,
} from "@/lib/background-jobs";
import { prisma } from "@/lib/prisma";
import { sendSlackMessage } from "@/lib/slack";
import { runTraAnalysis } from "@/lib/tra-engine";
import type { WorkerJobData } from "./runtime";
import { workerLogger } from "./logger";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected TRA worker failure";
}

export async function handleRunTraAnalysisJob(job: Job<WorkerJobData>) {
  const regressionAlertId =
    typeof job.data.payload?.regressionAlertId === "string"
      ? job.data.payload.regressionAlertId
      : null;

  if (!regressionAlertId) {
    await failBackgroundJob({
      backgroundJobId: job.data.backgroundJobId,
      message: "TRA analysis could not start because regressionAlertId is missing.",
    });
    throw new Error("regressionAlertId is required");
  }

  try {
    await updateBackgroundJobProgress({
      backgroundJobId: job.data.backgroundJobId,
      progress: 20,
      status: "running",
      message: "Loading regression alert and candidate dataset examples.",
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 5),
    });

    const alert = await prisma.regressionAlert.findFirst({
      where: {
        id: regressionAlertId,
        organizationId: job.data.organizationId,
      },
      include: {
        candidateRun: {
          include: {
            dataset: {
              include: {
                examples: {
                  orderBy: {
                    createdAt: "asc",
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!alert) {
      await failBackgroundJob({
        backgroundJobId: job.data.backgroundJobId,
        message: "TRA analysis failed because the regression alert was not found.",
      });
      throw new Error("Regression alert not found");
    }

    const examples = alert.candidateRun.dataset?.examples ?? [];
    if (examples.length === 0) {
      await failBackgroundJob({
        backgroundJobId: job.data.backgroundJobId,
        message: "TRA analysis failed because the candidate eval has no dataset examples.",
      });
      throw new Error("Candidate eval has no dataset examples");
    }

    await updateBackgroundJobProgress({
      backgroundJobId: job.data.backgroundJobId,
      progress: 45,
      status: "running",
      message: "Running TRA checks for conflicts, label noise, duplicates, and imbalance.",
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 3),
    });

    const analysis = await runTraAnalysis({
      regressionMetric: alert.metric,
      baselineScore: alert.baselineScore,
      candidateScore: alert.candidateScore,
      delta: alert.delta,
      examples: examples.map((example) => ({
        id: example.id,
        inputText: example.inputText,
        outputText: example.outputText,
        metadata: example.metadata,
      })),
    });

    const report = await prisma.traReport.upsert({
      where: {
        regressionAlertId,
      },
      update: {
        confidence: analysis.confidence,
        rootCauseCategory: analysis.rootCauseCategory,
        summary: analysis.summary,
        recommendedAction: analysis.recommendedAction,
        estimatedRecovery: analysis.estimatedRecovery,
      },
      create: {
        regressionAlertId,
        confidence: analysis.confidence,
        rootCauseCategory: analysis.rootCauseCategory,
        summary: analysis.summary,
        recommendedAction: analysis.recommendedAction,
        estimatedRecovery: analysis.estimatedRecovery,
      },
    });

    await prisma.suspiciousExample.deleteMany({
      where: {
        traReportId: report.id,
      },
    });

    if (analysis.suspiciousExamples.length > 0) {
      await prisma.suspiciousExample.createMany({
        data: analysis.suspiciousExamples.map((example) => ({
          traReportId: report.id,
          exampleId: example.exampleId,
          exampleIndex: example.exampleIndex,
          confidence: example.confidence,
          reason: example.reason,
          category: example.category,
          impactScore: example.impactScore,
          inputPreview: example.inputPreview ?? null,
          outputPreview: example.outputPreview ?? null,
        })),
      });
    }

    await sendSlackMessage(job.data.organizationId, {
      type: "regression_detected",
      metric: alert.metric,
      severity: alert.severity,
      confidence: analysis.confidence,
      rootCauseCategory: analysis.rootCauseCategory,
      path: `/regressions/${alert.id}`,
    });

    return completeBackgroundJob({
      backgroundJobId: job.data.backgroundJobId,
      message: "TRA analysis completed and suspicious examples are ready for review.",
      result: {
        regressionAlertId,
        traReportId: report.id,
        suspiciousExamples: analysis.suspiciousExamples.length,
      },
    });
  } catch (error) {
    const message = getErrorMessage(error);
    workerLogger.error({
      event: "tra_analysis_failed",
      regressionAlertId,
      workspaceId: job.data.organizationId,
      error: message,
    });

    await failBackgroundJob({
      backgroundJobId: job.data.backgroundJobId,
      message,
    });
    throw error;
  }
}
