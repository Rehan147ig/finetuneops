import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEvalRunFindFirst,
  mockRegressionAlertUpsert,
  mockLoggerError,
  mockEnqueueBackgroundJob,
} = vi.hoisted(() => ({
  mockEvalRunFindFirst: vi.fn(),
  mockRegressionAlertUpsert: vi.fn(),
  mockLoggerError: vi.fn(),
  mockEnqueueBackgroundJob: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    evalRun: {
      findFirst: mockEvalRunFindFirst,
    },
    regressionAlert: {
      upsert: mockRegressionAlertUpsert,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: mockLoggerError,
  },
}));

vi.mock("@/lib/background-jobs", () => ({
  enqueueBackgroundJob: mockEnqueueBackgroundJob,
}));

function makeEvalRun(input: {
  id: string;
  score?: number | null;
  scores?: Record<string, number> | null;
  createdAt?: Date;
}) {
  return {
    id: input.id,
    projectId: "project_1",
    datasetId: null,
    jobId: null,
    name: input.id,
    benchmark: "regression-suite",
    status: "completed",
    score: input.score ?? null,
    scores: input.scores ?? null,
    delta: null,
    judge: "system",
    createdAt: input.createdAt ?? new Date("2026-04-24T12:00:00.000Z"),
    updatedAt: input.createdAt ?? new Date("2026-04-24T12:00:00.000Z"),
  };
}

function makeAlert(metric = "accuracy") {
  return {
    id: `alert_${metric}`,
    organizationId: "org_1",
    projectId: "project_1",
    baselineEvalRunId: "eval_baseline",
    candidateEvalRunId: "eval_candidate",
    metric,
    baselineScore: 0.9,
    candidateScore: 0.82,
    delta: -0.08,
    severity: "critical",
    status: "open",
    traReportId: null,
    createdAt: new Date("2026-04-24T12:00:00.000Z"),
    updatedAt: new Date("2026-04-24T12:00:00.000Z"),
  };
}

describe("regression-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueBackgroundJob.mockResolvedValue({ id: "bg_1" });
  });

  it("does not detect regression when candidate scores improve", async () => {
    const { detectRegressionBetweenRuns } = await import("./regression-engine");
    const regressions = detectRegressionBetweenRuns(
      makeEvalRun({ id: "eval_baseline", scores: { accuracy: 0.88 } }),
      makeEvalRun({ id: "eval_candidate", scores: { accuracy: 0.91 } }),
    );

    expect(regressions).toEqual([]);
  });

  it("detects higher-is-better metric drops at threshold", async () => {
    const { detectRegressionBetweenRuns } = await import("./regression-engine");
    const regressions = detectRegressionBetweenRuns(
      makeEvalRun({ id: "eval_baseline", scores: { accuracy: 0.9 } }),
      makeEvalRun({ id: "eval_candidate", scores: { accuracy: 0.86 } }),
    );

    expect(regressions).toEqual([
      expect.objectContaining({
        metric: "accuracy",
        baselineScore: 0.9,
        candidateScore: 0.86,
        delta: expect.closeTo(-0.04, 8),
        severity: "warning",
      }),
    ]);
  });

  it("detects lower-is-better metric increases", async () => {
    const { detectRegressionBetweenRuns } = await import("./regression-engine");
    const regressions = detectRegressionBetweenRuns(
      makeEvalRun({ id: "eval_baseline", scores: { hallucination_rate: 0.04 } }),
      makeEvalRun({ id: "eval_candidate", scores: { hallucination_rate: 0.11 } }),
    );

    expect(regressions).toEqual([
      expect.objectContaining({
        metric: "hallucination_rate",
        delta: expect.closeTo(0.07, 8),
        severity: "critical",
      }),
    ]);
  });

  it("falls back to legacy score as accuracy", async () => {
    const { detectRegressionBetweenRuns } = await import("./regression-engine");
    const regressions = detectRegressionBetweenRuns(
      makeEvalRun({ id: "eval_baseline", score: 0.92 }),
      makeEvalRun({ id: "eval_candidate", score: 0.84 }),
    );

    expect(regressions[0]).toEqual(
      expect.objectContaining({
        metric: "accuracy",
        severity: "critical",
      }),
    );
  });

  it("createRegressionAlerts persists alerts idempotently", async () => {
    mockRegressionAlertUpsert.mockResolvedValue(makeAlert("accuracy"));
    const { createRegressionAlerts } = await import("./regression-engine");

    const alerts = await createRegressionAlerts({
      organizationId: "org_1",
      projectId: "project_1",
      baselineEvalRunId: "eval_baseline",
      candidateEvalRunId: "eval_candidate",
      regressions: [
        {
          metric: "accuracy",
          baselineScore: 0.9,
          candidateScore: 0.82,
          delta: -0.08,
          severity: "critical",
        },
      ],
    });

    expect(alerts).toHaveLength(1);
    expect(mockRegressionAlertUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          baselineEvalRunId_candidateEvalRunId_metric: {
            baselineEvalRunId: "eval_baseline",
            candidateEvalRunId: "eval_candidate",
            metric: "accuracy",
          },
        },
      }),
    );
    expect(mockEnqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "run-tra-analysis",
        payload: {
          regressionAlertId: "alert_accuracy",
        },
      }),
    );
  });

  it("autoDetectRegressionAfterEval returns empty when there is no baseline", async () => {
    mockEvalRunFindFirst
      .mockResolvedValueOnce(makeEvalRun({ id: "eval_candidate" }))
      .mockResolvedValueOnce(null);

    const { autoDetectRegressionAfterEval } = await import("./regression-engine");
    const alerts = await autoDetectRegressionAfterEval({
      organizationId: "org_1",
      projectId: "project_1",
      evalRunId: "eval_candidate",
    });

    expect(alerts).toEqual([]);
    expect(mockRegressionAlertUpsert).not.toHaveBeenCalled();
  });

  it("autoDetectRegressionAfterEval creates alerts when candidate regresses", async () => {
    mockEvalRunFindFirst
      .mockResolvedValueOnce(makeEvalRun({
        id: "eval_candidate",
        scores: { accuracy: 0.82 },
        createdAt: new Date("2026-04-24T12:00:00.000Z"),
      }))
      .mockResolvedValueOnce(makeEvalRun({
        id: "eval_baseline",
        scores: { accuracy: 0.9 },
        createdAt: new Date("2026-04-23T12:00:00.000Z"),
      }));
    mockRegressionAlertUpsert.mockResolvedValue(makeAlert("accuracy"));

    const { autoDetectRegressionAfterEval } = await import("./regression-engine");
    const alerts = await autoDetectRegressionAfterEval({
      organizationId: "org_1",
      projectId: "project_1",
      evalRunId: "eval_candidate",
    });

    expect(alerts).toHaveLength(1);
    expect(mockRegressionAlertUpsert).toHaveBeenCalledTimes(1);
  });

  it("autoDetectRegressionAfterEval never throws when detection storage fails", async () => {
    mockEvalRunFindFirst.mockRejectedValue(new Error("database unavailable"));

    const { autoDetectRegressionAfterEval } = await import("./regression-engine");
    const alerts = await autoDetectRegressionAfterEval({
      organizationId: "org_1",
      projectId: "project_1",
      evalRunId: "eval_candidate",
    });

    expect(alerts).toEqual([]);
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "regression_detection_failed",
      }),
    );
  });
});
