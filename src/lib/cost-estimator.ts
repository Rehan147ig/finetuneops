export type SupportedModelId =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-3.5-turbo"
  | "claude-3-haiku"
  | "claude-3-sonnet"
  | "llama-3-8b"
  | "llama-3-70b";

export type ModelPricing = {
  id: SupportedModelId;
  label: string;
  provider: "OpenAI" | "Anthropic" | "HuggingFace";
  inputCostPerMillionTokens?: number;
  outputCostPerMillionTokens?: number;
  hourlyRate?: number;
  tokensPerExample: number;
  trainingOverhead: number;
  hourlyMultiplier?: number;
};

export type FineTuneEstimate = {
  datasetSize: number;
  model: SupportedModelId;
  estimatedEpochs: number;
  estimatedCost: number;
  lowQualityTraceRate: number;
  recommendedAction: string;
  potentialSavings: number;
  blockedWithoutConfirmation: boolean;
};

export const modelPricing: Record<SupportedModelId, ModelPricing> = {
  "gpt-4o": {
    id: "gpt-4o",
    label: "gpt-4o",
    provider: "OpenAI",
    inputCostPerMillionTokens: 2.5,
    outputCostPerMillionTokens: 10,
    tokensPerExample: 650,
    trainingOverhead: 7.25,
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    label: "gpt-4o-mini",
    provider: "OpenAI",
    inputCostPerMillionTokens: 0.15,
    outputCostPerMillionTokens: 0.6,
    tokensPerExample: 650,
    trainingOverhead: 7.25,
  },
  "gpt-3.5-turbo": {
    id: "gpt-3.5-turbo",
    label: "gpt-3.5-turbo",
    provider: "OpenAI",
    inputCostPerMillionTokens: 0.5,
    outputCostPerMillionTokens: 1.5,
    tokensPerExample: 650,
    trainingOverhead: 7.25,
  },
  "claude-3-haiku": {
    id: "claude-3-haiku",
    label: "claude-3-haiku",
    provider: "Anthropic",
    inputCostPerMillionTokens: 0.25,
    outputCostPerMillionTokens: 1.25,
    tokensPerExample: 650,
    trainingOverhead: 7.25,
  },
  "claude-3-sonnet": {
    id: "claude-3-sonnet",
    label: "claude-3-sonnet",
    provider: "Anthropic",
    inputCostPerMillionTokens: 3,
    outputCostPerMillionTokens: 15,
    tokensPerExample: 650,
    trainingOverhead: 7.25,
  },
  "llama-3-8b": {
    id: "llama-3-8b",
    label: "llama-3-8b",
    provider: "HuggingFace",
    hourlyRate: 1,
    tokensPerExample: 650,
    trainingOverhead: 1,
    hourlyMultiplier: 1.35,
  },
  "llama-3-70b": {
    id: "llama-3-70b",
    label: "llama-3-70b",
    provider: "HuggingFace",
    hourlyRate: 2.5,
    tokensPerExample: 650,
    trainingOverhead: 1,
    hourlyMultiplier: 3.1,
  },
};

export function isSupportedModelId(value: string): value is SupportedModelId {
  return value in modelPricing;
}

export function getModelPricing(modelId: SupportedModelId): ModelPricing {
  return modelPricing[modelId];
}

export function estimateLowQualityTraceRate(datasetQuality: number): number {
  return Math.min(100, Math.max(0, Math.round(100 - datasetQuality)));
}

export function estimatePotentialSavings(
  estimatedCost: number,
  lowQualityTraceRate: number,
): number {
  return Number((estimatedCost * (lowQualityTraceRate / 100)).toFixed(2));
}

export function requiresHighCostConfirmation(estimatedCost: number): boolean {
  return estimatedCost > 50;
}

export function getRecommendedAction(lowQualityTraceRate: number): string {
  return lowQualityTraceRate >= 25 ? "Clean dataset first" : "Proceed to fine-tune";
}

function blendedCostPerMillion(pricing: ModelPricing): number {
  if (
    pricing.inputCostPerMillionTokens === undefined ||
    pricing.outputCostPerMillionTokens === undefined
  ) {
    return 0;
  }

  return pricing.inputCostPerMillionTokens * 0.8 + pricing.outputCostPerMillionTokens * 0.2;
}

export function estimateFineTuneCost(input: {
  datasetSize: number;
  model: SupportedModelId;
  estimatedEpochs: number;
  datasetQuality: number;
}): FineTuneEstimate {
  const pricing = getModelPricing(input.model);
  const lowQualityTraceRate = estimateLowQualityTraceRate(input.datasetQuality);
  let estimatedCost = 0;

  if (pricing.provider === "HuggingFace") {
    const estimatedHours =
      (input.datasetSize / 3000) * input.estimatedEpochs * (pricing.hourlyMultiplier ?? 1);
    estimatedCost = estimatedHours * (pricing.hourlyRate ?? 0);
  } else {
    const totalTokens =
      input.datasetSize * pricing.tokensPerExample * input.estimatedEpochs;
    estimatedCost =
      (totalTokens / 1_000_000) * blendedCostPerMillion(pricing) * pricing.trainingOverhead;
  }

  estimatedCost = Number(estimatedCost.toFixed(2));

  return {
    datasetSize: input.datasetSize,
    model: input.model,
    estimatedEpochs: input.estimatedEpochs,
    estimatedCost,
    lowQualityTraceRate,
    recommendedAction: getRecommendedAction(lowQualityTraceRate),
    potentialSavings: estimatePotentialSavings(estimatedCost, lowQualityTraceRate),
    blockedWithoutConfirmation: requiresHighCostConfirmation(estimatedCost),
  };
}
