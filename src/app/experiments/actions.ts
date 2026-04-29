"use server";

import { revalidatePath } from "next/cache";
import { errorResult, successResult, warningResult, type ActionResult } from "@/lib/action-state";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { prisma } from "@/lib/prisma";
import { getDefaultUserId, recordActivityEvent } from "@/lib/workspace-data";
import {
  canCreateExperimentFromDataset,
  nextPromptVersion,
} from "@/lib/workflow-rules";

export async function createExperimentFromDatasetAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const datasetId = String(formData.get("datasetId") || "");

  if (!datasetId) {
    return errorResult("Dataset id is required before an experiment can start.");
  }

  const dataset = await prisma.dataset.findUnique({
    where: {
      id: datasetId,
    },
    include: {
      project: {
        include: {
          experiments: true,
        },
      },
      experiments: true,
    },
  });

  if (!dataset) {
    return errorResult("We could not find the dataset you tried to use.");
  }

  const creation = canCreateExperimentFromDataset({
    datasetStatus: dataset.status,
    quality: dataset.qualityScore ?? 0,
  });

  if (!creation.allowed) {
    return warningResult(creation.error);
  }

  const promptVersion = nextPromptVersion(
    dataset.project.experiments.map((item) => item.promptVersion),
  );
  const preferredModel =
    (dataset.qualityScore ?? 0) >= 90 ? "gpt-4o-mini" : "llama-3-8b";

  const experiment = await prisma.experimentRun.create({
    data: {
      projectId: dataset.projectId,
      datasetId: dataset.id,
      name: `${dataset.name} candidate`,
      goal: `Improve outcomes on ${dataset.name}`,
      candidateModel: preferredModel,
      promptVersion,
      status: "running",
      score: Math.min((dataset.qualityScore ?? 80) - 3, 96),
      costEstimate: Math.max(dataset.rowCount / 1200, 75),
    },
  });

  await recordActivityEvent({
    projectId: dataset.projectId,
    type: "experiment_started",
    message: `${experiment.name} started from ${dataset.name} ${dataset.version}`,
    userId: await getDefaultUserId(dataset.projectId),
    metadata: {
      datasetId: dataset.id,
      experimentId: experiment.id,
      model: experiment.candidateModel,
    },
  });

  await enqueueBackgroundJob({
    organizationId: dataset.project.organizationId,
    projectId: dataset.projectId,
    jobType: "run-experiment",
    payload: {
      datasetId: dataset.id,
      experimentId: experiment.id,
    },
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 4),
  });

  revalidatePath("/");
  revalidatePath("/datasets");
  revalidatePath("/experiments");

  return successResult(`${experiment.name} is now running.`, "Experiment started");
}
