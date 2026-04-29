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

export const POST = withApiErrorHandling("trace_ingest_failed", async (request: Request) => {
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

  const contentLength = request.headers.get("content-length");

  if (contentLength && Number.parseInt(contentLength, 10) > 102_400) {
    return NextResponse.json(
      { error: "Request too large. Maximum size is 100KB." },
      { status: 413 },
    );
  }

  const rawBody = await request.text();

  if (rawBody.length > 102_400) {
    return NextResponse.json(
      { error: "Request too large. Maximum size is 100KB." },
      { status: 413 },
    );
  }

  const payload = JSON.parse(rawBody) as unknown;
  const validation = validateTraceIngestPayload(payload);

  if (!validation.ok) {
    return NextResponse.json(
      {
        error: validation.error,
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
      { status: 503 },
    );
  }

  const usageDecision = await enforceTraceLimit(organizationId);

  if (!usageDecision.allowed) {
    return NextResponse.json(
      {
        error: usageDecision.reason,
      },
      { status: 402 },
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
      { status: 404 },
    );
  }

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
      severity: validation.data.latency_ms > 2500 ? "high" : "medium",
      spanCount: Math.max(validation.data.tags.length, 1),
      opportunityScore: traceOpportunityFromSeverity(
        validation.data.latency_ms > 2500 ? "high" : "medium",
      ),
    },
  });

  await recordActivityEvent({
    projectId: project.id,
    type: "trace_captured",
    message: `${trace.title} was ingested from ${validation.data.model}`,
    userId: await getDefaultUserId(project.id),
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

  await enqueueBackgroundJob({
    organizationId,
    projectId: project.id,
    jobType: "safety-scan",
    payload: {
      traceId: trace.id,
      model: validation.data.model,
    },
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 2),
  });

  await incrementTraceUsage(organizationId);

  return NextResponse.json(
    {
      id: trace.id,
      status: "captured",
      timestamp: trace.capturedAt.toISOString(),
    },
    { status: 201, headers: rateLimitHeaders(rl) },
  );
});
