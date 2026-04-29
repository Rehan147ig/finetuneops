import {
  canAdvanceRelease,
  canCreateExperimentFromDataset,
  canLaunchFineTuneFromExperiment,
  canPromoteTrace,
  datasetNameFromTraceTitle,
  nextDatasetVersion,
  nextPromptVersion,
  traceOpportunityFromSeverity,
  validateTraceInput,
} from "@/lib/workflow-rules";
import {
  estimateFineTuneCost,
  estimateLowQualityTraceRate,
  estimatePotentialSavings,
  getRecommendedAction,
} from "@/lib/cost-estimator";
import { buildExperimentMatrix } from "@/lib/experiment-matrix";
import { buildWorkspaceNudges } from "@/lib/nudge-engine";
import {
  generateReviewToken,
  getReviewLinkExpiry,
  isReviewLinkExpired,
} from "@/lib/review-links";

describe("workflow-rules", () => {
  test("validateTraceInput accepts valid data", () => {
    expect(
      validateTraceInput({
        title: "Escalation loop after refund denial",
        source: "Support trace",
        severity: "high",
      }).ok,
    ).toBe(true);
  });

  test("trace promotion rejects already converted traces", () => {
    expect(
      canPromoteTrace({
        status: "triaged",
        opportunity: 90,
        convertedDatasetId: "dataset_1",
      }).allowed,
    ).toBe(false);
  });

  test("release advancement approves a passing gated release", () => {
    expect(
      canAdvanceRelease({
        status: "gated",
        qualityGate: "Pass",
        latencyGate: "Pass",
        costGate: "Watch",
      }),
    ).toEqual({
      allowed: true,
      nextStatus: "approved",
    });
  });

  test("dataset and prompt helpers advance versions", () => {
    expect(nextDatasetVersion(["v1", "v2"])).toBe("v3");
    expect(nextPromptVersion(["support-v1.8", "support-v1.9"])).toBe("support-v1.10");
    expect(datasetNameFromTraceTitle("Escalation loop after refund denial")).toBe("Escalation loop");
  });

  test("experiment and fine-tune guards block weak candidates", () => {
    expect(
      canCreateExperimentFromDataset({
        datasetStatus: "ready",
        quality: 60,
      }).allowed,
    ).toBe(false);

    expect(
      canLaunchFineTuneFromExperiment({
        status: "Running",
        score: 90,
      }).allowed,
    ).toBe(false);
  });

  test("severity affects opportunity scoring", () => {
    expect(traceOpportunityFromSeverity("high")).toBeGreaterThan(
      traceOpportunityFromSeverity("medium"),
    );
  });

  test("validateTraceInput rejects short and overlong fields", () => {
    expect(
      validateTraceInput({
        title: "short",
        source: "Support trace",
        severity: "medium",
      }).ok,
    ).toBe(false);

    expect(
      validateTraceInput({
        title: "Escalation loop after refund denial",
        source: "x".repeat(81),
        severity: "medium",
      }).ok,
    ).toBe(false);
  });

  test("trace promotion blocks low-opportunity and needs-labeling traces", () => {
    expect(
      canPromoteTrace({
        status: "needs_labeling",
        opportunity: 88,
      }).allowed,
    ).toBe(false);

    expect(
      canPromoteTrace({
        status: "triaged",
        opportunity: 60,
      }).allowed,
    ).toBe(false);
  });

  test("release advancement blocks invalid lifecycle and live releases", () => {
    expect(
      canAdvanceRelease({
        status: "unknown",
        qualityGate: "Pass",
        latencyGate: "Pass",
        costGate: "Pass",
      }).allowed,
    ).toBe(false);

    expect(
      canAdvanceRelease({
        status: "live",
        qualityGate: "Pass",
        latencyGate: "Pass",
        costGate: "Pass",
      }).allowed,
    ).toBe(false);
  });
});

describe("cost and matrix helpers", () => {
  test("estimate helpers return the expected savings recommendation", () => {
    expect(estimateLowQualityTraceRate(66)).toBe(34);
    expect(estimatePotentialSavings(4.2, 34)).toBe(1.43);
    expect(getRecommendedAction(34)).toBe("Clean dataset first");
  });

  test("fine-tune estimate returns a detailed breakdown", () => {
    expect(
      estimateFineTuneCost({
        datasetSize: 1240,
        model: "gpt-4o-mini",
        estimatedEpochs: 3,
        datasetQuality: 66,
      }),
    ).toMatchObject({
      estimatedCost: 4.21,
      lowQualityTraceRate: 34,
      potentialSavings: 1.43,
    });
  });

  test("experiment matrix surfaces best-value and ship-this verdicts", () => {
    const matrix = buildExperimentMatrix([
      { id: "base", model: "gpt-4o-mini", qualityScore: 84, isFineTuned: false },
      { id: "finetuned", model: "llama-3-8b", qualityScore: 95, isFineTuned: true },
      { id: "capable", model: "gpt-4o", qualityScore: 92, isFineTuned: false },
    ]);

    expect(matrix.find((row) => row.id === "finetuned")?.verdict).toBe("Ship This");
    expect(matrix.some((row) => row.verdict === "Best Value")).toBe(true);
  });

  test("high-cost estimate requires explicit confirmation", () => {
    expect(
      estimateFineTuneCost({
        datasetSize: 1240,
        model: "gpt-4o",
        estimatedEpochs: 3,
        datasetQuality: 66,
      }).blockedWithoutConfirmation,
    ).toBe(true);
  });
});

describe("nudges and review links", () => {
  test("nudge engine surfaces actionable warnings", () => {
    const nudges = buildWorkspaceNudges({
      traces: [
        {
          id: "trace_1",
          title: "Refund loop 1",
          source: "Support",
          status: "Triaged",
          severity: "High",
          spanCount: 3,
          opportunity: 91,
          capturedAt: "Today",
          canPromote: true,
        },
        {
          id: "trace_2",
          title: "Refund loop 2",
          source: "Support",
          status: "Triaged",
          severity: "High",
          spanCount: 4,
          opportunity: 88,
          capturedAt: "Today",
          canPromote: true,
        },
      ],
      experiments: [],
      jobs: [],
      evals: [],
      releases: [],
    });

    expect(nudges[0]?.actionLabel).toBe("Review traces");
  });

  test("review links expire after seven days or a decision", () => {
    const token = generateReviewToken();
    expect(token.length).toBeGreaterThanOrEqual(24);

    const expiresAt = getReviewLinkExpiry(new Date("2026-04-20T00:00:00.000Z"));
    expect(expiresAt.toISOString()).toBe("2026-04-27T00:00:00.000Z");

    expect(
      isReviewLinkExpired({
        expiresAt,
        decidedAt: new Date("2026-04-21T00:00:00.000Z"),
        now: new Date("2026-04-22T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  test("nudge engine flags stale experiments and blocked releases", () => {
    const nudges = buildWorkspaceNudges({
      traces: [],
      experiments: [
        {
          id: "experiment_1",
          name: "Experiment v2",
          goal: "Improve support quality",
          candidateModel: "gpt-4o-mini",
          promptVersion: "support-v2.0",
          status: "Running",
          score: 81,
          cost: 12,
          ageHours: 130,
        },
      ],
      jobs: [
        {
          id: "job_1",
          name: "Fine-tune",
          baseModel: "gpt-4o-mini",
          provider: "RunPod",
          status: "Completed",
          progress: 100,
          gpuType: "A100",
          gpuHours: 0.2,
          checkpoint: "done",
        },
      ],
      evals: [
        {
          id: "eval_1",
          name: "Regression suite",
          benchmark: "Support",
          score: 74,
          delta: -5,
          status: "Regressed",
          judge: "LLM judge",
        },
      ],
      releases: [
        {
          id: "release_1",
          name: "Support Specialist v2.4",
          channel: "Staging",
          status: "Gated",
          qualityGate: "Pass",
          latencyGate: "Pass",
          costGate: "Watch",
          approvedBy: "Waiting",
          ageHours: 60,
        },
      ],
    });

    expect(nudges.some((nudge) => nudge.id === "stale-experiment")).toBe(true);
    expect(nudges.some((nudge) => nudge.id === "expensive-regression")).toBe(true);
    expect(nudges.some((nudge) => nudge.id === "pending-reviews")).toBe(true);
  });
});
