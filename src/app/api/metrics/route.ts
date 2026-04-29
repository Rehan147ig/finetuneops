import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getQueueStats } from "@/lib/queue-monitor";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withApiErrorHandling } from "@/lib/api-handler";
import { getCacheMetrics } from "@/lib/system-status";

async function getActiveWorkspacesLast24Hours() {
  const traces = await prisma.traceEvent.findMany({
    where: {
      capturedAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
    distinct: ["projectId"],
    select: {
      project: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  return new Set(traces.map((trace) => trace.project.organizationId)).size;
}

async function getTracesLastHour() {
  return prisma.traceEvent.count({
    where: {
      capturedAt: {
        gte: new Date(Date.now() - 60 * 60 * 1000),
      },
    },
  });
}

async function getFineTuneJobsRunning() {
  return prisma.trainingJob.count({
    where: {
      status: "running",
    },
  });
}

function logMetricFailure(metric: string, reason: unknown) {
  logger.warn({
    event: "metrics_collection_failed",
    metric,
    error: reason instanceof Error ? reason.message : "unknown",
  });
}

export const GET = withApiErrorHandling("metrics_route_failed", async (request) => {
  const env = getServerEnv();
  const authorization = request.headers.get("authorization");

  if (!env.ADMIN_SECRET || authorization !== `Bearer ${env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [
    activeWorkspacesResult,
    tracesLastHourResult,
    finetuneJobsResult,
    queueStatsResult,
    cacheMetricsResult,
  ] = await Promise.allSettled([
    getActiveWorkspacesLast24Hours(),
    getTracesLastHour(),
    getFineTuneJobsRunning(),
    getQueueStats(),
    getCacheMetrics(),
  ]);

  if (activeWorkspacesResult.status === "rejected") {
    logMetricFailure("active_workspaces_24h", activeWorkspacesResult.reason);
  }

  if (tracesLastHourResult.status === "rejected") {
    logMetricFailure("traces_last_hour", tracesLastHourResult.reason);
  }

  if (finetuneJobsResult.status === "rejected") {
    logMetricFailure("finetune_jobs_running", finetuneJobsResult.reason);
  }

  if (queueStatsResult.status === "rejected") {
    logMetricFailure("queue_depths", queueStatsResult.reason);
  }

  if (cacheMetricsResult.status === "rejected") {
    logMetricFailure("cache_metrics", cacheMetricsResult.reason);
  }

  return NextResponse.json(
    {
      activeWorkspaces24h:
        activeWorkspacesResult.status === "fulfilled"
          ? activeWorkspacesResult.value
          : null,
      tracesLastHour:
        tracesLastHourResult.status === "fulfilled" ? tracesLastHourResult.value : null,
      finetuneJobsRunning:
        finetuneJobsResult.status === "fulfilled" ? finetuneJobsResult.value : null,
      queues: queueStatsResult.status === "fulfilled" ? queueStatsResult.value : null,
      cache: cacheMetricsResult.status === "fulfilled" ? cacheMetricsResult.value : null,
      collectedAt: new Date().toISOString(),
    },
    { status: 200 },
  );
});
