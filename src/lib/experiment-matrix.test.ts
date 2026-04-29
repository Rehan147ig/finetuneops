import { describe, expect, it } from "vitest";
import {
  buildExperimentMatrix,
  getCostPer1kTokens,
  getLatencyP50Ms,
} from "./experiment-matrix";

describe("getCostPer1kTokens", () => {
  it("returns blended token pricing for api-hosted models", () => {
    expect(getCostPer1kTokens("gpt-4o-mini")).toBe(0.0002);
  });
});

describe("getLatencyP50Ms", () => {
  it("returns the configured latency profile", () => {
    expect(getLatencyP50Ms("claude-3-sonnet")).toBe(910);
  });
});

describe("buildExperimentMatrix", () => {
  it("marks the best value candidate", () => {
    const matrix = buildExperimentMatrix([
      {
        id: "candidate_1",
        model: "gpt-4o-mini",
        qualityScore: 86,
        isFineTuned: false,
      },
      {
        id: "candidate_2",
        model: "gpt-4o",
        qualityScore: 92,
        isFineTuned: false,
      },
      {
        id: "candidate_3",
        model: "claude-3-sonnet",
        qualityScore: 89,
        isFineTuned: false,
      },
    ]);

    expect(matrix.find((row) => row.id === "candidate_1")?.verdict).toBe("Best Value");
  });

  it("marks the strongest fine-tuned candidate as ship this", () => {
    const matrix = buildExperimentMatrix([
      {
        id: "base",
        model: "gpt-4o-mini",
        qualityScore: 84,
        isFineTuned: false,
      },
      {
        id: "fine_tuned",
        model: "llama-3-8b",
        qualityScore: 88,
        isFineTuned: true,
      },
    ]);

    expect(matrix.find((row) => row.id === "fine_tuned")?.verdict).toBe("Ship This");
  });

  it("keeps the lowest-cost remaining candidate marked affordable", () => {
    const matrix = buildExperimentMatrix([
      {
        id: "most_capable",
        model: "gpt-4o",
        qualityScore: 95,
        isFineTuned: false,
      },
      {
        id: "affordable",
        model: "gpt-4o-mini",
        qualityScore: 30,
        isFineTuned: false,
      },
      {
        id: "balanced",
        model: "claude-3-haiku",
        qualityScore: 85,
        isFineTuned: false,
      },
    ]);

    expect(matrix.find((row) => row.id === "affordable")?.verdict).toBe("Most Affordable");
  });
});
