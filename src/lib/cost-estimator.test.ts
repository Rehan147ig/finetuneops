import { describe, expect, it } from "vitest";
import {
  estimateFineTuneCost,
  estimateLowQualityTraceRate,
  estimatePotentialSavings,
  getModelPricing,
  getRecommendedAction,
  requiresHighCostConfirmation,
} from "./cost-estimator";

describe("getModelPricing", () => {
  it("returns the configured pricing for a supported model", () => {
    expect(getModelPricing("gpt-4o-mini").provider).toBe("OpenAI");
  });
});

describe("estimateLowQualityTraceRate", () => {
  it("maps dataset quality to a low-quality trace percentage", () => {
    expect(estimateLowQualityTraceRate(66)).toBe(34);
  });
});

describe("estimatePotentialSavings", () => {
  it("returns the savings unlocked by cleaning the noisy portion", () => {
    expect(estimatePotentialSavings(4.2, 34)).toBe(1.43);
  });
});

describe("getRecommendedAction", () => {
  it("recommends cleaning when low-quality traces are high", () => {
    expect(getRecommendedAction(34)).toBe("Clean dataset first");
  });
});

describe("requiresHighCostConfirmation", () => {
  it("requires confirmation when the estimate exceeds fifty dollars", () => {
    expect(requiresHighCostConfirmation(50.01)).toBe(true);
    expect(requiresHighCostConfirmation(49.99)).toBe(false);
  });
});

describe("estimateFineTuneCost", () => {
  it("matches the expected gpt-4o-mini estimate shape", () => {
    const estimate = estimateFineTuneCost({
      datasetSize: 1240,
      model: "gpt-4o-mini",
      estimatedEpochs: 3,
      datasetQuality: 66,
    });

    expect(estimate).toMatchObject({
      estimatedCost: 4.21,
      lowQualityTraceRate: 34,
      recommendedAction: "Clean dataset first",
      potentialSavings: 1.43,
      blockedWithoutConfirmation: false,
    });
  });

  it("flags large-model runs that exceed the confirmation threshold", () => {
    const estimate = estimateFineTuneCost({
      datasetSize: 1240,
      model: "gpt-4o",
      estimatedEpochs: 3,
      datasetQuality: 66,
    });

    expect(estimate.estimatedCost).toBeGreaterThan(50);
    expect(estimate.blockedWithoutConfirmation).toBe(true);
  });

  it("estimates open-source model cost from hourly infrastructure rates", () => {
    const estimate = estimateFineTuneCost({
      datasetSize: 3000,
      model: "llama-3-8b",
      estimatedEpochs: 3,
      datasetQuality: 84,
    });

    expect(estimate.estimatedCost).toBeGreaterThan(0);
    expect(estimate.recommendedAction).toBe("Proceed to fine-tune");
  });
});
