import {
  activeProject,
  datasets as mockDatasets,
  evals as mockEvals,
  experiments as mockExperiments,
  jobs as mockJobs,
  metrics as mockMetrics,
  releases as mockReleases,
  traces as mockTraces,
  workflow,
  workspaceName,
} from "@/lib/mock-data";
import { cached, CacheKeys, CacheTTL, invalidate } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { isReviewLinkExpired } from "@/lib/review-links";
import type {
  ActivityEventType,
  ActivityItem,
  ActivityLogEntry,
  ActivityLogMetadata,
  BackgroundJobRecord,
  DatasetRecord,
  EvalRecord,
  ExperimentRecord,
  ReleaseRecord,
  TraceRecord,
  TrainingJobRecord,
  WorkspaceMetric,
  WorkspaceSummary,
  WorkflowStage,
} from "@/lib/types";
import { canLaunchFineTuneFromExperiment, canPromoteTrace } from "@/lib/workflow-rules";

export type WorkspaceData = {
  workspaceName: string;
  activeProject: string;
  summary: WorkspaceSummary;
  workflow: WorkflowStage[];
  metrics: WorkspaceMetric[];
  activity: ActivityItem[];
  traces: TraceRecord[];
  datasets: DatasetRecord[];
  experiments: ExperimentRecord[];
  jobs: TrainingJobRecord[];
  backgroundJobs: BackgroundJobRecord[];
  evals: EvalRecord[];
  releases: ReleaseRecord[];
};

export type ActivityLogPayload = {
  projectId: string;
  type: ActivityEventType;
  message: string;
  userId: string;
  metadata?: ActivityLogMetadata;
  timestamp?: Date;
};

export type WorkspaceScope = {
  organizationId: string;
};

export type TracePageResult = {
  traces: TraceRecord[];
  nextCursor: string | null;
};

const activityTitleByType: Record<ActivityEventType, string> = {
  trace_captured: "Trace captured",
  trace_promoted: "Trace promoted",
  dataset_created: "Dataset created",
  dataset_scored: "Dataset scored",
  prompt_template_created: "Prompt template created",
  prompt_version_created: "Prompt version created",
  prompt_version_deployed: "Prompt version deployed",
  experiment_started: "Experiment started",
  fine_tune_launched: "Fine-tune launched",
  fine_tune_completed: "Fine-tune completed",
  fine_tune_failed: "Fine-tune failed",
  release_approved: "Release approved",
  release_rejected: "Release rejected",
  background_job_completed: "Background job completed",
  trial_ending_soon: "Trial ending soon",
  subscription_cancelled: "Subscription cancelled",
};

const activityKindByType: Record<ActivityEventType, ActivityItem["kind"]> = {
  trace_captured: "trace",
  trace_promoted: "trace",
  dataset_created: "dataset",
  dataset_scored: "dataset",
  prompt_template_created: "experiment",
  prompt_version_created: "experiment",
  prompt_version_deployed: "release",
  experiment_started: "experiment",
  fine_tune_launched: "job",
  fine_tune_completed: "job",
  fine_tune_failed: "job",
  release_approved: "release",
  release_rejected: "release",
  background_job_completed: "job",
  trial_ending_soon: "release",
  subscription_cancelled: "release",
};

export const activityLog: ActivityLogEntry[] = [
  {
    id: "activity_fallback_trace",
    type: "trace_captured",
    message: "Fallback trace backlog was loaded from the local workspace snapshot",
    timestamp: "2026-04-18T11:30:00.000Z",
    userId: "system",
    metadata: {
      source: "fallback",
    },
  },
  {
    id: "activity_fallback_release",
    type: "release_approved",
    message: "Fallback release review is waiting on an approver decision",
    timestamp: "2026-04-18T08:15:00.000Z",
    userId: "system",
    metadata: {
      channel: "staging",
    },
  },
];

export function sortActivityLogEntries(entries: ActivityLogEntry[]): ActivityLogEntry[] {
  return [...entries].sort((left, right) => {
    return new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
  });
}

export function toActivityItem(entry: ActivityLogEntry): ActivityItem {
  const timestamp = new Date(entry.timestamp);

  return {
    id: entry.id,
    title: activityTitleByType[entry.type],
    detail: entry.message,
    kind: activityKindByType[entry.type],
    at: timestamp.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

export async function recordActivityEvent(payload: ActivityLogPayload) {
  const entry = await prisma.activityLog.create({
    data: {
      projectId: payload.projectId,
      type: payload.type,
      message: payload.message,
      userId: payload.userId,
      metadata: JSON.stringify(payload.metadata ?? {}),
      timestamp: payload.timestamp ?? new Date(),
    },
  });

  activityLog.unshift({
    id: entry.id,
    type: entry.type as ActivityEventType,
    message: entry.message,
    timestamp: entry.timestamp.toISOString(),
    userId: entry.userId,
    metadata: parseActivityMetadata(entry.metadata),
  });

  const project = await prisma.project.findUnique({
    where: {
      id: payload.projectId,
    },
    select: {
      organizationId: true,
    },
  });

  if (project?.organizationId) {
    await invalidate(CacheKeys.activityTimeline(project.organizationId));
  }

  return entry;
}

export async function getDefaultUserId(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: {
      id: projectId,
    },
    include: {
      organization: {
        include: {
          users: {
            orderBy: {
              createdAt: "asc",
            },
            take: 1,
          },
        },
      },
    },
  });

  return project?.organization?.users[0]?.id ?? "system";
}

export function parseActivityMetadata(metadata: string): ActivityLogMetadata {
  try {
    const parsed = JSON.parse(metadata) as ActivityLogMetadata;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

type TraceListItem = {
  id: string;
  title: string;
  source: string;
  status: string;
  severity: string;
  spanCount: number;
  opportunityScore: number;
  capturedAt: Date;
  convertedDatasetId: string | null;
};

function toTraceRecord(item: TraceListItem): TraceRecord {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    status:
      item.status === "ready_for_curation"
        ? "Ready for curation"
        : item.status === "needs_labeling"
          ? "Needs labeling"
          : "Triaged",
    severity:
      item.severity === "high" ? "High" : item.severity === "low" ? "Low" : "Medium",
    spanCount: item.spanCount,
    opportunity: item.opportunityScore,
    capturedAt: item.capturedAt.toLocaleDateString("en-US"),
    canPromote: canPromoteTrace({
      status: item.status,
      opportunity: item.opportunityScore,
      convertedDatasetId: item.convertedDatasetId,
    }).allowed,
    convertedDatasetId: item.convertedDatasetId ?? undefined,
  };
}

function fallbackTracePage(cursor?: string, limit = 20): TracePageResult {
  const startIndex = cursor
    ? Math.max(0, mockTraces.findIndex((item) => item.id === cursor) + 1)
    : 0;
  const rawPage = mockTraces.slice(startIndex, startIndex + limit + 1);
  const traces = rawPage.slice(0, limit);

  return {
    traces,
    nextCursor: rawPage.length > limit ? traces[traces.length - 1]?.id ?? null : null,
  };
}

function fallbackWorkspaceData(): WorkspaceData {
  return {
    workspaceName,
    activeProject,
    summary: {
      organizationName: workspaceName,
      billingPlan: "pro",
      projectCount: 1,
      memberCount: 3,
      activeProjectStatus: "active",
    },
    workflow,
    metrics: mockMetrics,
    activity: sortActivityLogEntries(activityLog).map(toActivityItem),
    traces: mockTraces,
    datasets: mockDatasets,
    experiments: mockExperiments,
    jobs: mockJobs,
    backgroundJobs: [],
    evals: mockEvals,
    releases: mockReleases,
  };
}

type WorkspacePlanSnapshot = {
  organizationName: string;
  billingPlan: string;
  projectCount: number;
  memberCount: number;
};

export async function getWorkspacePlan(organizationId: string): Promise<WorkspacePlanSnapshot | null> {
  return cached(
    CacheKeys.workspacePlan(organizationId),
    CacheTTL.workspacePlan,
    async () => {
      const organization = await prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: {
          name: true,
          billingPlan: true,
          _count: {
            select: {
              projects: true,
              users: true,
            },
          },
        },
      });

      if (!organization) {
        return null;
      }

      return {
        organizationName: organization.name,
        billingPlan: organization.billingPlan,
        projectCount: organization._count.projects,
        memberCount: organization._count.users,
      };
    },
  );
}

export async function getActivityTimeline(organizationId: string): Promise<ActivityItem[]> {
  return cached(
    CacheKeys.activityTimeline(organizationId),
    CacheTTL.activityTimeline,
    async () => {
      const project = await prisma.project.findFirst({
        where: {
          organizationId,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          activityLogs: {
            orderBy: {
              timestamp: "desc",
            },
            take: 12,
          },
        },
      });

      if (!project || project.activityLogs.length === 0) {
        return sortActivityLogEntries(activityLog).map(toActivityItem);
      }

      return sortActivityLogEntries(
        project.activityLogs.map((item) => ({
          id: item.id,
          type: item.type as ActivityEventType,
          message: item.message,
          timestamp: item.timestamp.toISOString(),
          userId: item.userId,
          metadata: parseActivityMetadata(item.metadata),
        })),
      ).map(toActivityItem);
    },
  );
}

export async function getDatasetQualityReport(datasetId: string) {
  return cached(
    CacheKeys.datasetQuality(datasetId),
    CacheTTL.datasetQuality,
    () =>
      prisma.datasetQualityReport.findUnique({
        where: {
          datasetId,
        },
      }),
  );
}

export async function getTracePage(
  scope: WorkspaceScope,
  options: { cursor?: string; limit?: number } = {},
): Promise<TracePageResult> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

  try {
    const project = await prisma.project.findFirst({
      where: {
        organizationId: scope.organizationId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      return fallbackTracePage(options.cursor, limit);
    }

    const traces = await prisma.traceEvent.findMany({
      where: {
        projectId: project.id,
      },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      skip: options.cursor ? 1 : 0,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        source: true,
        status: true,
        severity: true,
        spanCount: true,
        opportunityScore: true,
        capturedAt: true,
        convertedDatasetId: true,
      },
    });

    const visibleTraces = traces.slice(0, limit);

    return {
      traces: visibleTraces.map(toTraceRecord),
      nextCursor: traces.length > limit ? visibleTraces[visibleTraces.length - 1]?.id ?? null : null,
    };
  } catch {
    return fallbackTracePage(options.cursor, limit);
  }
}

export async function getWorkspaceData(scope?: WorkspaceScope): Promise<WorkspaceData> {
  try {
    const [planSnapshot, activityItems] = scope
      ? await Promise.all([
          getWorkspacePlan(scope.organizationId),
          getActivityTimeline(scope.organizationId),
        ])
      : [null, sortActivityLogEntries(activityLog).map(toActivityItem)];

    const project = await prisma.project.findFirst({
      where: scope
        ? {
            organizationId: scope.organizationId,
          }
        : undefined,
      include: {
        organization: true,
        traceEvents: {
          orderBy: {
            createdAt: "desc",
          },
        },
        datasets: true,
        experiments: true,
        trainingJobs: true,
        backgroundJobs: {
          orderBy: {
            createdAt: "desc",
          },
          take: 12,
        },
        evalRuns: true,
        releases: {
          include: {
            reviewLinks: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!project) {
      return fallbackWorkspaceData();
    }

    const readyDatasets = project.datasets.filter((item) => item.status === "ready").length;
    const experimentWins = project.experiments.filter((item) => (item.score ?? 0) >= 80).length;
    const experimentRate =
      project.experiments.length === 0
        ? 0
        : (experimentWins / project.experiments.length) * 100;
    const aiSpend =
      project.trainingJobs.reduce((sum, item) => sum + item.gpuHours * 110, 0) +
      project.experiments.reduce((sum, item) => sum + (item.costEstimate ?? 0), 0);

    return {
      workspaceName: planSnapshot?.organizationName ?? project.organization?.name ?? workspaceName,
      activeProject: project.name,
      summary: {
        organizationName: planSnapshot?.organizationName ?? project.organization?.name ?? workspaceName,
        billingPlan: planSnapshot?.billingPlan ?? project.organization?.billingPlan ?? "starter",
        projectCount: planSnapshot?.projectCount ?? 1,
        memberCount: planSnapshot?.memberCount ?? 1,
        activeProjectStatus: project.status,
      },
      workflow,
      metrics: [
        {
          label: "Trace backlog",
          value: String(project.traceEvents.length),
          detail: `${project.traceEvents.filter((item) => item.status === "ready_for_curation").length} traces ready for curation`,
        },
        {
          label: "Datasets ready",
          value: String(readyDatasets),
          detail: `${project.datasets.length} total dataset versions tracked`,
        },
        {
          label: "Experiment win rate",
          value: `${experimentRate.toFixed(1)}%`,
          detail: `${experimentWins} winning candidates over baseline`,
        },
        {
          label: "Monthly AI spend",
          value: `$${Math.round(aiSpend).toLocaleString("en-US")}`,
          detail: "Estimated from experiment and fine-tune usage",
        },
      ],
      activity: activityItems,
      traces: project.traceEvents.map(toTraceRecord),
      datasets: project.datasets.map((item) => ({
        id: item.id,
        name: item.name,
        version: item.version,
        status:
          item.status === "ready"
            ? "Ready"
            : item.status === "needs_review"
              ? "Needs review"
              : "Processing",
        rows: item.rowCount,
        source: item.source ?? "Unknown source",
        quality: item.qualityScore ?? 0,
        lastUpdated: item.updatedAt.toLocaleDateString("en-US"),
        experimentCount: project.experiments.filter((experiment) => experiment.datasetId === item.id).length,
      })),
      experiments: project.experiments.map((item) => ({
        id: item.id,
        name: item.name,
        goal: item.goal,
        candidateModel: item.candidateModel,
        promptVersion: item.promptVersion,
        status: item.status === "promote" ? "Promote" : item.status === "review" ? "Review" : "Running",
        score: item.score ?? 0,
        cost: item.costEstimate ?? 0,
        ageHours: Math.max(
          0,
          Math.round((Date.now() - item.updatedAt.getTime()) / (1000 * 60 * 60)),
        ),
        canLaunchFineTune: canLaunchFineTuneFromExperiment({
          status: item.status === "promote" ? "Promote" : item.status === "review" ? "Review" : "Running",
          score: item.score ?? 0,
        }).allowed,
        linkedJobCount: project.trainingJobs.filter((job) => job.experimentId === item.id).length,
        datasetName: project.datasets.find((dataset) => dataset.id === item.datasetId)?.name ?? undefined,
      })),
      jobs: project.trainingJobs.map((item) => ({
        id: item.id,
        name: item.name,
        baseModel: item.modelBase,
        provider: item.provider,
        status:
          item.status === "completed"
            ? "Completed"
            : item.status === "failed"
              ? "Failed"
              : item.status === "running"
                ? "Running"
                : "Queued",
        progress: item.progress,
        gpuType: item.gpuType ?? "Unknown",
        gpuHours: item.gpuHours,
        checkpoint: item.checkpoint ?? "Not configured",
        experimentName: project.experiments.find((experiment) => experiment.id === item.experimentId)?.name ?? undefined,
        datasetName: project.datasets.find((dataset) => dataset.id === item.datasetId)?.name ?? undefined,
        openaiJobId: item.openaiJobId ?? item.providerJobId ?? undefined,
        pollCount: item.pollCount,
        progressNote: item.progressNote ?? undefined,
        completedModelId: item.completedModelId ?? item.fineTunedModelId ?? undefined,
      })),
      backgroundJobs: project.backgroundJobs.map((item) => ({
        id: item.id,
        queueName: item.queueName,
        jobType: item.jobType,
        status:
          item.status === "completed"
            ? "Completed"
            : item.status === "failed"
              ? "Failed"
              : item.status === "running"
                ? "Running"
                : "Queued",
        progress: item.progress,
        attempts: item.attempts,
        maxAttempts: item.maxAttempts,
        estimatedCompletion: item.estimatedCompletionAt?.toLocaleString("en-US"),
        logs: (() => {
          try {
            const parsed = JSON.parse(item.logs) as string[];
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
        createdAt: item.createdAt.toLocaleString("en-US"),
      })),
      evals: project.evalRuns.map((item) => ({
        id: item.id,
        name: item.name,
        benchmark: item.benchmark,
        score: item.score ?? 0,
        delta: item.delta ?? 0,
        status:
          item.status === "passing"
            ? "Passing"
            : item.status === "regressed"
              ? "Regressed"
              : "Watch",
        judge: item.judge ?? "Unknown judge",
      })),
      releases: project.releases.map((item) => {
        const latestReviewLink = item.reviewLinks
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
        const reviewLinkStatus = latestReviewLink
          ? latestReviewLink.decidedAt
            ? "decided"
            : isReviewLinkExpired({
                expiresAt: latestReviewLink.expiresAt,
                decidedAt: latestReviewLink.decidedAt,
              })
              ? "expired"
              : "active"
          : undefined;

        return {
          id: item.id,
          name: item.name,
          channel: item.channel,
          status: item.status === "live" ? "Live" : item.status === "approved" ? "Approved" : "Gated",
          qualityGate: item.qualityGate,
          latencyGate: item.latencyGate,
          costGate: item.costGate,
          approvedBy: item.approvedBy ?? "Waiting",
          ageHours: Math.max(
            0,
            Math.round((Date.now() - item.updatedAt.getTime()) / (1000 * 60 * 60)),
          ),
          reviewLinkToken:
            latestReviewLink && reviewLinkStatus === "active" ? latestReviewLink.token : undefined,
          reviewLinkStatus,
        };
      }),
    };
  } catch {
    return fallbackWorkspaceData();
  }
}
