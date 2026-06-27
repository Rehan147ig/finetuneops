import type { EvalRun, RegressionAlert } from "@prisma/client";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export type RegressionDirection = "higher_is_better" | "lower_is_better";

export type RegressionThreshold = {
  metric: string;
  minDelta: number;
  criticalDelta?: number;
  direction: RegressionDirection;
};

export type DetectedRegression = {
  metric: string;
  baselineScore: number;
  candidateScore: number;
  delta: number;
  severity: "warning" | "critical";
};

export const DEFAULT_REGRESSION_THRESHOLDS: RegressionThreshold[] = [
  { metric: "accuracy", minDelta: 0.03, criticalDelta: 0.08, direction: "higher_is_better" },
  { metric: "f1", minDelta: 0.03, criticalDelta: 0.08, direction: "higher_is_better" },
  { metric: "precision", minDelta: 0.03, criticalDelta: 0.08, direction: "higher_is_better" },
  { metric: "recall", minDelta: 0.03, criticalDelta: 0.08, direction: "higher_is_better" },
  { metric: "helpfulness", minDelta: 0.05, criticalDelta: 0.12, direction: "higher_is_better" },
  { metric: "safety", minDelta: 0.02, criticalDelta: 0.05, direction: "higher_is_better" },
  { metric: "hallucination_rate", minDelta: 0.02, criticalDelta: 0.06, direction: "lower_is_better" },
  { metric: "latency_ms", minDelta: 250, criticalDelta: 750, direction: "lower_is_better" },
  { metric: "cost_per_1k", minDelta: 0.1, criticalDelta: 0.3, direction: "lower_is_better" },
];

type EvalRunWithScores = Pick<EvalRun, "id" | "score" | "scores">;

function isScoreMap(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeEvalScores(evalRun: EvalRunWithScores): Record<string, number> {
  const scores: Record<string, number> = {};

  if (isScoreMap(evalRun.scores)) {
    for (const [metric, value] of Object.entries(evalRun.scores)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        scores[metric] = value;
      }
    }
  }

  if (typeof evalRun.score === "number" && Number.isFinite(evalRun.score) && scores.accuracy === undefined) {
    scores.accuracy = evalRun.score;
  }

  return scores;
}

function isRegression(delta: number, threshold: RegressionThreshold) {
  if (threshold.direction === "higher_is_better") {
    return delta <= -threshold.minDelta;
  }

  return delta >= threshold.minDelta;
}

function getRegressionMagnitude(delta: number, threshold: RegressionThreshold) {
  return threshold.direction === "higher_is_better" ? Math.abs(Math.min(delta, 0)) : Math.max(delta, 0);
}

export function detectRegressionBetweenRuns(
  baseline: EvalRunWithScores,
  candidate: EvalRunWithScores,
  thresholds: RegressionThreshold[] = DEFAULT_REGRESSION_THRESHOLDS,
): DetectedRegression[] {
  const baselineScores = normalizeEvalScores(baseline);
  const candidateScores = normalizeEvalScores(candidate);

  return thresholds.flatMap((threshold) => {
    const baselineScore = baselineScores[threshold.metric];
    const candidateScore = candidateScores[threshold.metric];

    if (baselineScore === undefined || candidateScore === undefined) {
      return [];
    }

    const delta = candidateScore - baselineScore;
    if (!isRegression(delta, threshold)) {
      return [];
    }

    const criticalDelta = threshold.criticalDelta ?? threshold.minDelta * 2;
    const severity = getRegressionMagnitude(delta, threshold) >= criticalDelta ? "critical" : "warning";

    return [
      {
        metric: threshold.metric,
        baselineScore,
        candidateScore,
        delta,
        severity,
      },
    ];
  });
}

export async function createRegressionAlerts(input: {
  organizationId: string;
  projectId: string;
  baselineEvalRunId: string;
  candidateEvalRunId: string;
  regressions: DetectedRegression[];
}): Promise<RegressionAlert[]> {
  const alerts: RegressionAlert[] = [];

  for (const regression of input.regressions) {
    const alert = await prisma.regressionAlert.upsert({
      where: {
        baselineEvalRunId_candidateEvalRunId_metric: {
          baselineEvalRunId: input.baselineEvalRunId,
          candidateEvalRunId: input.candidateEvalRunId,
          metric: regression.metric,
        },
      },
      update: {
        baselineScore: regression.baselineScore,
        candidateScore: regression.candidateScore,
        delta: regression.delta,
        severity: regression.severity,
        status: "open",
      },
      create: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        baselineEvalRunId: input.baselineEvalRunId,
        candidateEvalRunId: input.candidateEvalRunId,
        metric: regression.metric,
        baselineScore: regression.baselineScore,
        candidateScore: regression.candidateScore,
        delta: regression.delta,
        severity: regression.severity,
        status: "open",
      },
    });

    if (alert.severity === "warning" || alert.severity === "critical") {
      try {
        await enqueueBackgroundJob({
          organizationId: input.organizationId,
          projectId: input.projectId,
          jobType: "run-tra-analysis",
          payload: {
            regressionAlertId: alert.id,
          },
          estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 5),
        });
      } catch (error) {
        logger.warn({
          event: "tra_analysis_enqueue_failed",
          regressionAlertId: alert.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    alerts.push(alert);
  }

  return alerts;
}

export async function autoDetectRegressionAfterEval(input: {
  organizationId: string;
  projectId: string;
  evalRunId: string;
  thresholds?: RegressionThreshold[];
}): Promise<RegressionAlert[]> {
  try {
    const candidate = await prisma.evalRun.findFirst({
      where: {
        id: input.evalRunId,
        projectId: input.projectId,
        status: "completed",
      },
    });

    if (!candidate) {
      return [];
    }

    const baseline = await prisma.evalRun.findFirst({
      where: {
        projectId: input.projectId,
        status: "completed",
        benchmark: candidate.benchmark,
        id: {
          not: input.evalRunId,
        },
        createdAt: {
          lt: candidate.createdAt,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!baseline) {
      return [];
    }

    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { regressionThresholds: true },
    });

    const projectThresholds = project?.regressionThresholds
      ? (project.regressionThresholds as unknown as RegressionThreshold[])
      : undefined;

    const regressions = detectRegressionBetweenRuns(
      baseline,
      candidate,
      input.thresholds ?? projectThresholds ?? DEFAULT_REGRESSION_THRESHOLDS,
    );

    if (regressions.length === 0) {
      return [];
    }

    return createRegressionAlerts({
      organizationId: input.organizationId,
      projectId: input.projectId,
      baselineEvalRunId: baseline.id,
      candidateEvalRunId: candidate.id,
      regressions,
    });
  } catch (error) {
    logger.error({
      event: "regression_detection_failed",
      organizationId: input.organizationId,
      projectId: input.projectId,
      evalRunId: input.evalRunId,
      error: error instanceof Error ? error.message : "Unknown regression detection error",
    });
    return [];
  }
}
