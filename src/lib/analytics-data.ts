import { cached } from "@/lib/cache";
import { prisma } from "@/lib/prisma";

export type DailyCount = {
  day: string;
  count: number;
};

export type ModelBreakdown = {
  model: string;
  count: number;
  errorRate: number;
};

export type CostDataPoint = {
  model: string;
  totalCost: number;
  successCost: number;
  wastedCost: number;
};

export type EvalTrend = {
  version: string;
  qualityScore: number;
  latencyMs: number;
  costPer1k: number;
  releasedAt: string;
  model?: string;
  trainedTokens?: number;
};

export type TeamActivity = {
  userId: string;
  userName: string;
  tracesCreated: number;
  datasetsCreated: number;
  releasesShipped: number;
};

export type AnalyticsSummary = {
  tracesTotal: number;
  tracesLast24h: number;
  tracesLast7d: number;
  errorRateLast7d: number;
  datasetsTotal: number;
  experimentsTotal: number;
  finetunesTotal: number;
  finetunesSucceeded: number;
  avgDatasetHealthScore: number;
};

export type AnalyticsRangePreset = "7d" | "30d" | "90d";

const DAY_MS = 24 * 60 * 60 * 1000;

function analyticsKey(scope: string, organizationId: string, suffix = "") {
  return `cache:analytics:${organizationId}:${scope}${suffix ? `:${suffix}` : ""}`;
}

function formatDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function projectWhere(organizationId: string, projectId?: string) {
  return {
    organizationId,
    ...(projectId ? { id: projectId } : {}),
  };
}

function trainingJobCost(input: { gpuHours: number; trainedTokens?: number | null }) {
  if (input.gpuHours > 0) {
    return Number((input.gpuHours * 110).toFixed(2));
  }

  if (input.trainedTokens && input.trainedTokens > 0) {
    return Number(((input.trainedTokens / 1000) * 0.03).toFixed(2));
  }

  return 0;
}

export function getDateRange(preset: AnalyticsRangePreset) {
  const to = new Date();
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);

  return { from, to };
}

export async function getAnalyticsSummary(organizationId: string, projectId?: string): Promise<AnalyticsSummary> {
  return cached(
    analyticsKey("summary", organizationId, projectId ?? "all"),
    300,
    async () => {
      try {
        const now = Date.now();
        const last24h = new Date(now - DAY_MS);
        const last7d = new Date(now - 7 * DAY_MS);

        const [
          tracesTotal,
          tracesLast24h,
          tracesLast7d,
          traceFailuresLast7d,
          datasetsTotal,
          experimentsTotal,
          finetunesTotal,
          finetunesSucceeded,
          reports,
        ] = await Promise.all([
          prisma.traceEvent.count({
            where: { project: { is: projectWhere(organizationId, projectId) } },
          }),
          prisma.traceEvent.count({
            where: {
              project: { is: projectWhere(organizationId, projectId) },
              capturedAt: { gte: last24h },
            },
          }),
          prisma.traceEvent.count({
            where: {
              project: { is: projectWhere(organizationId, projectId) },
              capturedAt: { gte: last7d },
            },
          }),
          prisma.traceEvent.count({
            where: {
              project: { is: projectWhere(organizationId, projectId) },
              capturedAt: { gte: last7d },
              status: "failed",
            },
          }),
          prisma.dataset.count({
            where: { project: { is: projectWhere(organizationId, projectId) } },
          }),
          prisma.experimentRun.count({
            where: { project: { is: projectWhere(organizationId, projectId) } },
          }),
          prisma.trainingJob.count({
            where: { project: { is: projectWhere(organizationId, projectId) } },
          }),
          prisma.trainingJob.count({
            where: {
              project: { is: projectWhere(organizationId, projectId) },
              status: "completed",
            },
          }),
          prisma.datasetQualityReport.findMany({
            where: {
              dataset: {
                is: {
                  project: {
                    is: projectWhere(organizationId, projectId),
                  },
                },
              },
            },
            select: {
              healthScore: true,
            },
          }),
        ]);

        const avgDatasetHealthScore =
          reports.length === 0
            ? 0
            : Number(
                (
                  reports.reduce((sum, report) => sum + report.healthScore, 0) / reports.length
                ).toFixed(1),
              );

        return {
          tracesTotal,
          tracesLast24h,
          tracesLast7d,
          errorRateLast7d: tracesLast7d === 0 ? 0 : traceFailuresLast7d / tracesLast7d,
          datasetsTotal,
          experimentsTotal,
          finetunesTotal,
          finetunesSucceeded,
          avgDatasetHealthScore,
        };
      } catch {
        return {
          tracesTotal: 0,
          tracesLast24h: 0,
          tracesLast7d: 0,
          errorRateLast7d: 0,
          datasetsTotal: 0,
          experimentsTotal: 0,
          finetunesTotal: 0,
          finetunesSucceeded: 0,
          avgDatasetHealthScore: 0,
        };
      }
    },
  );
}

export async function getTracesPerDay(
  organizationId: string,
  days: 7 | 30 | 90,
  projectId?: string,
): Promise<DailyCount[]> {
  return cached(
    analyticsKey("traces-per-day", organizationId, `${days}-${projectId ?? "all"}`),
    600,
    async () => {
      try {
        const from = new Date(Date.now() - (days - 1) * DAY_MS);
        const traces = await prisma.traceEvent.findMany({
          where: {
            project: { is: projectWhere(organizationId, projectId) },
            capturedAt: { gte: from },
          },
          select: {
            capturedAt: true,
          },
        });

        const counts = new Map<string, number>();
        for (const trace of traces) {
          const key = formatDayKey(trace.capturedAt);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        return Array.from({ length: days }, (_, index) => {
          const day = new Date(from.getTime() + index * DAY_MS);
          const key = formatDayKey(day);
          return {
            day: key,
            count: counts.get(key) ?? 0,
          };
        });
      } catch {
        return [];
      }
    },
  );
}

export async function getModelBreakdown(
  organizationId: string,
  days: 7 | 30 | 90 = 30,
  projectId?: string,
): Promise<ModelBreakdown[]> {
  return cached(
    analyticsKey("model-breakdown", organizationId, `${days}-${projectId ?? "all"}`),
    600,
    async () => {
      try {
        const from = new Date(Date.now() - days * DAY_MS);
        const traces = await prisma.traceEvent.findMany({
          where: {
            project: { is: projectWhere(organizationId, projectId) },
            capturedAt: { gte: from },
          },
          select: {
            modelName: true,
            status: true,
          },
        });

        const byModel = new Map<string, { count: number; failed: number }>();

        for (const trace of traces) {
          const model = trace.modelName || "unknown";
          const current = byModel.get(model) ?? { count: 0, failed: 0 };
          current.count += 1;
          if (trace.status === "failed") {
            current.failed += 1;
          }
          byModel.set(model, current);
        }

        return Array.from(byModel.entries())
          .map(([model, value]) => ({
            model,
            count: value.count,
            errorRate: value.count === 0 ? 0 : value.failed / value.count,
          }))
          .sort((left, right) => right.count - left.count);
      } catch {
        return [];
      }
    },
  );
}

export async function getCostAnalytics(
  organizationId: string,
  days: 7 | 30 | 90 = 30,
  projectId?: string,
): Promise<CostDataPoint[]> {
  return cached(
    analyticsKey("cost-analytics", organizationId, `${days}-${projectId ?? "all"}`),
    600,
    async () => {
      try {
        const from = new Date(Date.now() - days * DAY_MS);
        const jobs = await prisma.trainingJob.findMany({
          where: {
            project: { is: projectWhere(organizationId, projectId) },
            createdAt: { gte: from },
          },
          select: {
            modelBase: true,
            status: true,
            gpuHours: true,
            trainedTokens: true,
          },
        });

        const byModel = new Map<string, CostDataPoint>();

        for (const job of jobs) {
          const model = job.modelBase || "unknown";
          const estimatedCost = trainingJobCost(job);
          const existing =
            byModel.get(model) ??
            {
              model,
              totalCost: 0,
              successCost: 0,
              wastedCost: 0,
            };

          existing.totalCost = Number((existing.totalCost + estimatedCost).toFixed(2));

          if (job.status === "failed") {
            existing.wastedCost = Number((existing.wastedCost + estimatedCost).toFixed(2));
          } else {
            existing.successCost = Number((existing.successCost + estimatedCost).toFixed(2));
          }

          byModel.set(model, existing);
        }

        return Array.from(byModel.values()).sort((left, right) => right.totalCost - left.totalCost);
      } catch {
        return [];
      }
    },
  );
}

export async function getEvalTrends(organizationId: string, projectId?: string): Promise<EvalTrend[]> {
  return cached(
    analyticsKey("eval-trends", organizationId, projectId ?? "all"),
    1800,
    async () => {
      try {
        const jobs = await prisma.trainingJob.findMany({
          where: {
            project: { is: projectWhere(organizationId, projectId) },
            status: "completed",
          },
          orderBy: {
            finishedAt: "desc",
          },
          take: 12,
          select: {
            name: true,
            modelBase: true,
            validationLoss: true,
            trainedTokens: true,
            finishedAt: true,
            gpuHours: true,
          },
        });

        return jobs
          .filter((job) => job.finishedAt)
          .sort((left, right) => {
            return (right.finishedAt?.getTime() ?? 0) - (left.finishedAt?.getTime() ?? 0);
          })
          .slice(0, 10)
          .map((job) => {
            const estimatedCost = trainingJobCost(job);
            return {
              version: job.name,
              model: job.modelBase,
              qualityScore:
                job.validationLoss == null
                  ? 0
                  : Math.max(0, Math.round((1 - job.validationLoss) * 100)),
              latencyMs: 0,
              costPer1k:
                job.trainedTokens && job.trainedTokens > 0
                  ? Number(((estimatedCost / job.trainedTokens) * 1000).toFixed(4))
                  : 0,
              trainedTokens: job.trainedTokens ?? 0,
              releasedAt: (job.finishedAt ?? new Date()).toISOString(),
            };
          });
      } catch {
        return [];
      }
    },
  );
}

export async function getTeamActivity(
  organizationId: string,
  days: 7 | 30 | 90 = 7,
): Promise<TeamActivity[]> {
  return cached(
    analyticsKey("team-activity", organizationId, String(days)),
    300,
    async () => {
      try {
        const from = new Date(Date.now() - days * DAY_MS);
        const [logs, users] = await Promise.all([
          prisma.activityLog.findMany({
            where: {
              project: {
                is: {
                  organizationId,
                },
              },
              timestamp: {
                gte: from,
              },
            },
            select: {
              userId: true,
              type: true,
            },
          }),
          prisma.user.findMany({
            where: {
              organizationId,
            },
            select: {
              id: true,
              name: true,
            },
          }),
        ]);

        const userNames = new Map(users.map((user) => [user.id, user.name]));
        const activity = new Map<string, TeamActivity>();

        for (const log of logs) {
          const entry =
            activity.get(log.userId) ??
            {
              userId: log.userId,
              userName: userNames.get(log.userId) ?? "Unknown teammate",
              tracesCreated: 0,
              datasetsCreated: 0,
              releasesShipped: 0,
            };

          if (log.type === "trace_captured") {
            entry.tracesCreated += 1;
          }

          if (log.type === "dataset_created") {
            entry.datasetsCreated += 1;
          }

          if (log.type === "release_approved") {
            entry.releasesShipped += 1;
          }

          activity.set(log.userId, entry);
        }

        return Array.from(activity.values()).sort((left, right) => {
          const leftScore = left.tracesCreated + left.datasetsCreated + left.releasesShipped;
          const rightScore = right.tracesCreated + right.datasetsCreated + right.releasesShipped;
          return rightScore - leftScore;
        });
      } catch {
        return [];
      }
    },
  );
}
