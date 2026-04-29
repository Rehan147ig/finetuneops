"use server";

import { revalidatePath } from "next/cache";
import { errorResult, successResult, type ActionResult } from "@/lib/action-state";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { requireAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { getDefaultUserId, recordActivityEvent } from "@/lib/workspace-data";
import { nextDatasetVersion } from "@/lib/workflow-rules";

function parseFlaggedExampleIds(details: unknown, mode: "exact_duplicates" | "pii" | "all_flagged") {
  if (!details || typeof details !== "object") {
    return new Set<string>();
  }

  const typed = details as {
    duplicates?: { pairs?: Array<{ leftId: string; rightId: string; type: "exact" | "near" }> };
    pii?: { flagged?: Array<{ id: string }> };
    length?: { flagged?: Array<{ id: string }> };
    emptyOutputs?: { flagged?: string[] };
    language?: { flagged?: Array<{ id: string }> };
  };

  const ids = new Set<string>();

  if (mode === "exact_duplicates" || mode === "all_flagged") {
    for (const pair of typed.duplicates?.pairs ?? []) {
      if (pair.type === "exact") {
        ids.add(pair.rightId);
      }
    }
  }

  if (mode === "pii" || mode === "all_flagged") {
    for (const item of typed.pii?.flagged ?? []) {
      ids.add(item.id);
    }
  }

  if (mode === "all_flagged") {
    for (const item of typed.length?.flagged ?? []) {
      ids.add(item.id);
    }
    for (const item of typed.emptyOutputs?.flagged ?? []) {
      ids.add(item);
    }
    for (const item of typed.language?.flagged ?? []) {
      ids.add(item.id);
    }
  }

  return ids;
}

export async function removeFlaggedExamplesAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAuthSession();
  const datasetId = String(formData.get("datasetId") ?? "");
  const mode = String(formData.get("mode") ?? "") as "exact_duplicates" | "pii" | "all_flagged";

  if (!datasetId || !["exact_duplicates", "pii", "all_flagged"].includes(mode)) {
    return errorResult("Choose a dataset and a cleanup mode before continuing.");
  }

  const dataset = await prisma.dataset.findFirst({
    where: {
      id: datasetId,
      project: {
        organizationId: session.user.organizationId,
      },
    },
    include: {
      project: {
        include: {
          datasets: true,
        },
      },
      examples: true,
      qualityReport: true,
    },
  });

  if (!dataset || !dataset.qualityReport) {
    return errorResult("We could not find a quality-scored dataset to clean.");
  }

  const flaggedIds = parseFlaggedExampleIds(dataset.qualityReport.details, mode);
  const remainingExamples = dataset.examples.filter((example) => !flaggedIds.has(example.id));

  if (remainingExamples.length === dataset.examples.length) {
    return errorResult("This cleanup mode does not remove any examples from the current dataset.");
  }

  const nextVersion = nextDatasetVersion(dataset.project.datasets.map((item) => item.version));
  const cleanedDataset = await prisma.dataset.create({
    data: {
      projectId: dataset.projectId,
      name: dataset.name,
      version: nextVersion,
      source: `${dataset.source ?? "Dataset"} cleaned via ${mode.replaceAll("_", " ")}`,
      status: "processing",
      rowCount: remainingExamples.length,
      qualityScore: null,
    },
  });

  await prisma.datasetExample.createMany({
    data: remainingExamples.map((example) => ({
      datasetId: cleanedDataset.id,
      sourceTraceId: example.sourceTraceId,
      inputText: example.inputText,
      outputText: example.outputText,
      metadata: example.metadata,
    })),
  });

  await recordActivityEvent({
    projectId: dataset.projectId,
    type: "dataset_created",
    message: `${cleanedDataset.name} ${cleanedDataset.version} was created after ${mode.replaceAll("_", " ")} cleanup.`,
    userId: await getDefaultUserId(dataset.projectId),
    metadata: {
      datasetId: cleanedDataset.id,
      parentDatasetId: dataset.id,
      mode,
    },
  });

  await enqueueBackgroundJob({
    organizationId: session.user.organizationId,
    projectId: dataset.projectId,
    jobType: "score-dataset",
    payload: {
      datasetId: cleanedDataset.id,
    },
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 3),
  });

  revalidatePath("/datasets");
  revalidatePath(`/datasets/${dataset.id}`);
  revalidatePath(`/datasets/${cleanedDataset.id}`);

  return successResult(
    `${cleanedDataset.name} ${cleanedDataset.version} was created with ${remainingExamples.length} examples.`,
    "Dataset cleaned",
  );
}
