import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authenticateWorkspaceApiKey } from "@/lib/api-keys";
import { withApiErrorHandling } from "@/lib/api-handler";
import { enqueueBackgroundJob, enqueueBackgroundJobsBatch } from "@/lib/background-jobs";
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

  // Honour the x-finetuneops-project header (slug or id) sent by the SDK.
  // Falls back to the oldest project when not provided for backwards compat.
  const projectHint = request.headers.get("x-finetuneops-project")?.trim() || null;

  const project = projectHint
    ? await prisma.project.findFirst({
        where: {
          organizationId,
          OR: [{ id: projectHint }, { slug: projectHint }],
        },
      })
    : await prisma.project.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
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

  const usageDecision = await enforceTraceLimit(organizationId);

  if (!usageDecision.allowed) {
    return NextResponse.json(
      {
        error: usageDecision.reason ?? "Trace ingestion is not allowed for this workspace.",
      },
      { status: 403, headers: rateLimitHeaders(rl) },
    );
  }

  const validTraces: Array<{ index: number; data: any }> = [];

  for (const [index, candidate] of payload.traces.entries()) {
    const validation = validateTraceIngestPayload(candidate);

    if (!validation.ok) {
      errors.push({ index, error: validation.error });
    } else {
      validTraces.push({ index, data: validation.data });
    }
  }

  if (validTraces.length === 0) {
    return NextResponse.json(
      { accepted: 0, rejected: errors.length, errors },
      { status: 200, headers: rateLimitHeaders(rl) },
    );
  }

  const createdTraces = await prisma.$transaction(
    validTraces.map((t) => {
      const severity = t.data.latency_ms > 2500 ? "high" : "medium";
      return prisma.traceEvent.create({
        data: {
          projectId: project.id,
          title: summarizeTraceTitle(t.data.input),
          source: `${t.data.model} trace ingest`,
          inputText: t.data.input,
          outputText: t.data.output,
          modelName: t.data.model,
          latencyMs: t.data.latency_ms,
          metadata: JSON.stringify(t.data.metadata),
          tags: JSON.stringify(t.data.tags),
          status: "triaged",
          severity,
          spanCount: Math.max(t.data.tags.length, 1),
          opportunityScore: traceOpportunityFromSeverity(severity),
        },
      });
    })
  );

  await prisma.activityLog.createMany({
    data: validTraces.map((t, i) => ({
      projectId: project.id,
      type: "trace_captured",
      message: `${createdTraces[i].title} was ingested from ${t.data.model}`,
      userId: defaultUserId,
      metadata: JSON.stringify({
        traceId: createdTraces[i].id,
        model: t.data.model,
        latency_ms: t.data.latency_ms,
        tagCount: t.data.tags.length,
      }),
    })),
  });

  await enqueueBackgroundJobsBatch(
    validTraces.map((t, i) => ({
      organizationId,
      projectId: project.id,
      jobType: "ingest-trace",
      payload: {
        traceId: createdTraces[i].id,
        model: t.data.model,
      },
      estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 2),
    }))
  );

  await incrementTraceUsage(organizationId, validTraces.length);
  accepted = validTraces.length;

  return NextResponse.json(
    {
      accepted,
      rejected: errors.length,
      errors,
    },
    { status: 200, headers: rateLimitHeaders(rl) },
  );
});
