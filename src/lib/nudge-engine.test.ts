import { describe, expect, it } from "vitest";
import { buildWorkspaceNudges } from "./nudge-engine";

describe("buildWorkspaceNudges", () => {
  it("suggests promoting repeated failed traces", () => {
    const nudges = buildWorkspaceNudges({
      traces: [
        {
          id: "trace_1",
          title: "Refund loop 1",
          source: "Support",
          status: "Triaged",
          severity: "High",
          spanCount: 3,
          opportunity: 90,
          capturedAt: "Today",
          canPromote: true,
        },
        {
          id: "trace_2",
          title: "Refund loop 2",
          source: "Support",
          status: "Triaged",
          severity: "High",
          spanCount: 3,
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

    expect(nudges[0]?.id).toBe("promote-traces");
  });

  it("warns about stale running experiments", () => {
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
      jobs: [],
      evals: [],
      releases: [],
    });

    expect(nudges[0]?.id).toBe("stale-experiment");
  });

  it("flags expensive runs followed by regressed evals", () => {
    const nudges = buildWorkspaceNudges({
      traces: [],
      experiments: [],
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
      releases: [],
    });

    expect(nudges[0]?.id).toBe("expensive-regression");
    expect(nudges[0]?.severity).toBe("critical");
  });

  it("warns about releases waiting more than forty-eight hours", () => {
    const nudges = buildWorkspaceNudges({
      traces: [],
      experiments: [],
      jobs: [],
      evals: [],
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

    expect(nudges[0]?.id).toBe("pending-reviews");
  });
});
