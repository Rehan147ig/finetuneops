import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authenticateWorkspaceApiKey } from "@/lib/api-keys";
import { withApiErrorHandling } from "@/lib/api-handler";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { enforceTraceLimit, incrementTraceUsage } from "@/lib/billing-data";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getQueueStats, shouldApplyBackpressure } from "@/lib/queue-monitor";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getDefaultUserId, recordActivityEvent } from "@/lib/workspace-data";
import { summarizeTraceTitle, validateTraceIngestPayload } from "@/lib/trace-ingestion";
import { traceOpportunityFromSeverity } from "@/lib/workflow-rules";

type BatchPayload = {
  traces?: unknown;
};

export const POST = withApiErrorHandling("trace_batch_ingest_failed", async (request: Request) => {
  const apiKey =
    request.headers.get("x-api-key") ?? request.headers.get("x-finetuneops-key");
  const session = await auth();
  const apiKeyScope = apiKey ? await authenticateWorkspaceApiKey(apiKey) : null;
  const organizationId = apiKeyScope?.organizationId ?? session?.user?.organizationId;

  if (!organizationId) {
    return NextResponse.json(
      {
        error: "Authentication required. Provide a workspace session or API key.",
      },
      { status: 401 },
    );
  }

  const payload = (await request.json()) as BatchPayload;

  if (!Array.isArray(payload.traces)) {
    return NextResponse.json(
      {
        error: "traces must be an array.",
      },
      { status: 400 },
    );
  }

  if (payload.traces.length > 100) {
    return NextResponse.json(
      {
        error: "A batch can include at most 100 traces.",
      },
      { status: 400 },
    );
  }

  const rl = await checkRateLimit(organizationId, "traces");

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trace rate limit exceeded", retryAfter: 60 },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const queueStats = await getQueueStats();

  if (shouldApplyBackpressure(queueStats)) {
    logger.warn({
      event: "backpressure_applied",
      organizationId,
      queueStats,
    });
    return NextResponse.json(
      {
        error: "System under high load. Retry in 30 seconds.",
        retryAfter: 30,
      },
      { status: 503, headers: rateLimitHeaders(rl) },
    );
  }

  const project = await prisma.project.findFirst({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!project) {
    return NextResponse.json(
      {
        error: "No active project is available for trace ingestion.",
      },
      { status: 404, headers: rateLimitHeaders(rl) },
    );
  }

  let accepted = 0;
  const errors: Array<{ index: number; error: string }> = [];
  const defaultUserId = await getDefaultUserId(project.id);

  for (const [index, candidate] of payload.traces.entries()) {
    const validation = validateTraceIngestPayload(candidate);

    if (!validation.ok) {
      errors.push({ index, error: validation.error });
      continue;
    }

    const usageDecision = await enforceTraceLimit(organizationId);

    if (!usageDecision.allowed) {
      errors.push({
        index,
        error: usageDecision.reason ?? "Trace ingestion is not allowed for this workspace.",
      });
      continue;
    }

    const severity = validation.data.latency_ms > 2500 ? "high" : "medium";
    const trace = await prisma.traceEvent.create({
      data: {
        projectId: project.id,
        title: summarizeTraceTitle(validation.data.input),
        source: `${validation.data.model} trace ingest`,
        inputText: validation.data.input,
        outputText: validation.data.output,
        modelName: validation.data.model,
        latencyMs: validation.data.latency_ms,
        metadata: JSON.stringify(validation.data.metadata),
        tags: JSON.stringify(validation.data.tags),
        status: "triaged",
        severity,
        spanCount: Math.max(validation.data.tags.length, 1),
        opportunityScore: traceOpportunityFromSeverity(severity),
      },
    });

    await recordActivityEvent({
      projectId: project.id,
      type: "trace_captured",
      message: `${trace.title} was ingested from ${validation.data.model}`,
      userId: defaultUserId,
      metadata: {
        traceId: trace.id,
        model: validation.data.model,
        latency_ms: validation.data.latency_ms,
        tagCount: validation.data.tags.length,
      },
    });

    await enqueueBackgroundJob({
      organizationId,
      projectId: project.id,
      jobType: "ingest-trace",
      payload: {
        traceId: trace.id,
        model: validation.data.model,
      },
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 2),
    });

    await incrementTraceUsage(organizationId);
    accepted += 1;
  }

  return NextResponse.json(
    {
      accepted,
      rejected: errors.length,
      errors,
    },
    { status: 200, headers: rateLimitHeaders(rl) },
  );
});
