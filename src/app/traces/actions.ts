"use server";

import { revalidatePath } from "next/cache";
import { errorResult, successResult, warningResult, type ActionResult } from "@/lib/action-state";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { prisma } from "@/lib/prisma";
import { getDefaultUserId, recordActivityEvent } from "@/lib/workspace-data";
import {
  canPromoteTrace,
  datasetNameFromTraceTitle,
  nextDatasetVersion,
  traceOpportunityFromSeverity,
  validateTraceInput,
} from "@/lib/workflow-rules";

export async function createTraceAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const validation = validateTraceInput({
    title: String(formData.get("title") || ""),
    source: String(formData.get("source") || ""),
    severity: String(formData.get("severity") || "medium"),
  });

  if (!validation.ok) {
    return errorResult(validation.error, "Trace capture failed");
  }

  const project = await prisma.project.findFirst({
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!project) {
    return errorResult("No active project was found for this workspace.");
  }

  const trace = await prisma.traceEvent.create({
    data: {
      projectId: project.id,
      title: validation.data.title,
      source: validation.data.source,
      severity: validation.data.severity,
      status: "triaged",
      spanCount: 1,
      opportunityScore: traceOpportunityFromSeverity(validation.data.severity),
    },
  });

  await recordActivityEvent({
    projectId: project.id,
    type: "trace_captured",
    message: `${validation.data.title} was captured from ${validation.data.source}`,
    userId: await getDefaultUserId(project.id),
    metadata: {
      severity: validation.data.severity,
      source: validation.data.source,
    },
  });

  await enqueueBackgroundJob({
    organizationId: project.organizationId,
    projectId: project.id,
    jobType: "ingest-trace",
    payload: {
      traceId: trace.id,
      source: validation.data.source,
    },
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 2),
  });

  revalidatePath("/");
  revalidatePath("/traces");

  return successResult(`${validation.data.title} is now in the trace backlog.`, "Trace captured");
}

export async function promoteTraceToDatasetAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const traceId = String(formData.get("traceId") || "");

  if (!traceId) {
    return errorResult("Trace id is required before a promotion can start.");
  }

  const trace = await prisma.traceEvent.findUnique({
    where: {
      id: traceId,
    },
    include: {
      project: {
        include: {
          datasets: true,
        },
      },
    },
  });

  if (!trace) {
    return errorResult("We could not find the trace you tried to promote.");
  }

  const promotion = canPromoteTrace({
    status: trace.status,
    opportunity: trace.opportunityScore,
    convertedDatasetId: trace.convertedDatasetId,
  });

  if (!promotion.allowed) {
    return warningResult(promotion.error);
  }

  const version = nextDatasetVersion(trace.project.datasets.map((item) => item.version));
  const actorId = await getDefaultUserId(trace.projectId);
  const dataset = await prisma.dataset.create({
    data: {
      projectId: trace.projectId,
      name: datasetNameFromTraceTitle(trace.title) || "Curated trace set",
      version,
      source: `Curated from trace: ${trace.source}`,
      status: "ready",
      rowCount: Math.max(trace.spanCount * 24, 48),
      qualityScore: Math.min(trace.opportunityScore, 98),
    },
  });

  await prisma.datasetExample.create({
    data: {
      datasetId: dataset.id,
      sourceTraceId: trace.id,
      inputText: trace.inputText ?? trace.title,
      outputText: trace.outputText ?? `Review ${trace.title.toLowerCase()}`,
      metadata: trace.metadata,
    },
  });

  await prisma.traceEvent.update({
    where: {
      id: trace.id,
    },
    data: {
      status: "ready_for_curation",
      convertedDatasetId: dataset.id,
    },
  });

  await recordActivityEvent({
    projectId: trace.projectId,
    type: "trace_promoted",
    message: `${trace.title} was promoted into a reusable dataset candidate`,
    userId: actorId,
    metadata: {
      traceId: trace.id,
      datasetId: dataset.id,
      opportunity: trace.opportunityScore,
    },
  });

  await recordActivityEvent({
    projectId: trace.projectId,
    type: "dataset_created",
    message: `${dataset.name} ${dataset.version} was created from a promoted trace`,
    userId: actorId,
    metadata: {
      traceId: trace.id,
      datasetId: dataset.id,
      rows: dataset.rowCount,
      quality: dataset.qualityScore ?? 0,
    },
  });

  await enqueueBackgroundJob({
    organizationId: trace.project.organizationId,
    projectId: trace.projectId,
    jobType: "score-dataset",
    payload: {
      traceId: trace.id,
      datasetId: dataset.id,
    },
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 3),
  });

  revalidatePath("/");
  revalidatePath("/traces");
  revalidatePath("/datasets");

  return successResult(`${dataset.name} ${dataset.version} is ready for experiments.`, "Dataset created");
}
