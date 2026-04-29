"use server";

import { revalidatePath } from "next/cache";
import { errorResult, successResult, warningResult, type ActionResult } from "@/lib/action-state";
import { enqueueBackgroundJob, processBackgroundJobById, retryBackgroundJob } from "@/lib/background-jobs";
import { enforceFineTuneLimit, incrementFineTuneUsage } from "@/lib/billing-data";
import { requireWorkspaceManager } from "@/lib/auth-session";
import { estimateFineTuneCost, isSupportedModelId } from "@/lib/cost-estimator";
import { prisma } from "@/lib/prisma";
import { getDefaultUserId, recordActivityEvent } from "@/lib/workspace-data";
import {
  canLaunchFineTuneFromExperiment,
  trainingJobNameFromExperiment,
} from "@/lib/workflow-rules";

export async function launchFineTuneFromExperimentAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const experimentId = String(formData.get("experimentId") || "");
  const confirmHighCost = String(formData.get("confirmHighCost") || "") === "true";

  if (!experimentId) {
    return errorResult("Experiment id is required before a fine-tune can launch.");
  }

  const experiment = await prisma.experimentRun.findUnique({
    where: {
      id: experimentId,
    },
    include: {
      dataset: true,
      trainingJobs: true,
      project: {
        include: {
          organization: true,
        },
      },
    },
  });

  if (!experiment) {
    return errorResult("We could not find the experiment you tried to launch.");
  }

  const statusLabel =
    experiment.status === "promote"
      ? "Promote"
      : experiment.status === "review"
        ? "Review"
        : "Running";

  const launch = canLaunchFineTuneFromExperiment({
    status: statusLabel,
    score: experiment.score ?? 0,
  });

  if (!launch.allowed) {
    return warningResult(launch.error);
  }

  if (experiment.trainingJobs.some((job) => job.status === "queued" || job.status === "running")) {
    return warningResult("A queued or running fine-tune already exists for this experiment.");
  }

  if (!experiment.dataset) {
    return errorResult("A linked dataset is required before a fine-tune can launch.");
  }

  const billingGate = await enforceFineTuneLimit(experiment.project.organizationId);

  if (!billingGate.allowed) {
    return warningResult(
      billingGate.reason ?? "This plan cannot launch another fine-tune right now.",
      "Plan limit reached",
    );
  }

  if (!isSupportedModelId(experiment.candidateModel)) {
    return errorResult("This experiment is using a model that is not supported by the cost estimator yet.");
  }

  const estimate = estimateFineTuneCost({
    datasetSize: experiment.dataset.rowCount,
    model: experiment.candidateModel,
    estimatedEpochs: 3,
    datasetQuality: experiment.dataset.qualityScore ?? 0,
  });

  if (estimate.blockedWithoutConfirmation && !confirmHighCost) {
    return warningResult(
      `This run is estimated at $${estimate.estimatedCost.toFixed(2)}. Confirm the high-cost launch before proceeding.`,
      "Confirmation required",
    );
  }

  const job = await prisma.trainingJob.create({
    data: {
      projectId: experiment.projectId,
      datasetId: experiment.datasetId,
      experimentId: experiment.id,
      name: trainingJobNameFromExperiment(experiment.name),
      modelBase: experiment.candidateModel,
      provider: "RunPod",
      status: "queued",
      progress: 0,
      gpuType: "A100 80GB",
      gpuHours: 0,
      checkpoint: "Every 400 steps",
    },
  });

  await recordActivityEvent({
    projectId: experiment.projectId,
    type: "fine_tune_launched",
    message: `${job.name} was queued from ${experiment.name}`,
    userId: await getDefaultUserId(experiment.projectId),
    metadata: {
      experimentId: experiment.id,
      trainingJobId: job.id,
      provider: job.provider,
      model: job.modelBase,
    },
  });

  await enqueueBackgroundJob({
    organizationId: experiment.project.organizationId,
    projectId: experiment.projectId,
    jobType: "launch-finetune",
    payload: {
      experimentId: experiment.id,
      trainingJobId: job.id,
      datasetId: experiment.datasetId,
    },
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 8),
  });

  await incrementFineTuneUsage(experiment.project.organizationId);

  revalidatePath("/");
  revalidatePath("/experiments");
  revalidatePath("/jobs");

  return successResult(`${job.name} has been queued for execution.`, "Fine-tune launched");
}

export async function retryBackgroundJobAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireWorkspaceManager();
  const backgroundJobId = String(formData.get("backgroundJobId") ?? "");

  if (!backgroundJobId) {
    return errorResult("Choose a failed background job before retrying it.");
  }

  const backgroundJob = await prisma.backgroundJob.findFirst({
    where: {
      id: backgroundJobId,
      organizationId: session.user.organizationId,
    },
  });

  if (!backgroundJob) {
    return errorResult("We could not find that background job in this workspace.");
  }

  if (backgroundJob.status !== "failed") {
    return warningResult("Only failed background jobs can be retried.");
  }

  await retryBackgroundJob(backgroundJob.id);

  revalidatePath("/jobs");

  return successResult("The background job was re-queued.", "Background job retried");
}

export async function processBackgroundJobAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireWorkspaceManager();
  const backgroundJobId = String(formData.get("backgroundJobId") ?? "");

  if (!backgroundJobId) {
    return errorResult("Choose a queued background job before processing it.");
  }

  const backgroundJob = await prisma.backgroundJob.findFirst({
    where: {
      id: backgroundJobId,
      organizationId: session.user.organizationId,
    },
  });

  if (!backgroundJob) {
    return errorResult("We could not find that background job in this workspace.");
  }

  if (backgroundJob.status === "completed") {
    return warningResult("This background job has already completed.");
  }

  await processBackgroundJobById(backgroundJob.id);

  revalidatePath("/");
  revalidatePath("/datasets");
  revalidatePath("/experiments");
  revalidatePath("/jobs");

  return successResult("The background job finished processing.", "Background job processed");
}
