import { getModelPricing, isSupportedModelId, type SupportedModelId } from "@/lib/cost-estimator";

export type MatrixVerdict =
  | "Ship This"
  | "Best Value"
  | "Most Capable"
  | "Most Affordable"
  | "Recommended";

export type ExperimentMatrixCandidate = {
  id: string;
  model: string;
  qualityScore: number;
  isFineTuned: boolean;
};

export type ExperimentMatrixRow = {
  id: string;
  model: string;
  qualityScore: number;
  costPer1kTokens: number;
  latencyP50: number;
  verdict: MatrixVerdict;
};

type ScoredMatrixRow = Omit<ExperimentMatrixRow, "verdict"> & {
  isFineTuned: boolean;
};

const derivedOpenSourceCostPer1k: Record<SupportedModelId, number | undefined> = {
  "gpt-4o": undefined,
  "gpt-4o-mini": undefined,
  "gpt-3.5-turbo": undefined,
  "claude-3-haiku": undefined,
  "claude-3-sonnet": undefined,
  "llama-3-8b": 0.0008,
  "llama-3-70b": 0.0035,
};

const latencyByModel: Record<SupportedModelId, number> = {
  "gpt-4o": 780,
  "gpt-4o-mini": 430,
  "gpt-3.5-turbo": 510,
  "claude-3-haiku": 460,
  "claude-3-sonnet": 910,
  "llama-3-8b": 540,
  "llama-3-70b": 1180,
};

export function getCostPer1kTokens(model: SupportedModelId): number {
  const pricing = getModelPricing(model);

  if (
    pricing.inputCostPerMillionTokens !== undefined &&
    pricing.outputCostPerMillionTokens !== undefined
  ) {
    const blendedPerMillion =
      pricing.inputCostPerMillionTokens * 0.8 + pricing.outputCostPerMillionTokens * 0.2;
    return Number((blendedPerMillion / 1000).toFixed(4));
  }

  return derivedOpenSourceCostPer1k[model] ?? 0;
}

export function getLatencyP50Ms(model: SupportedModelId): number {
  return latencyByModel[model];
}

export function getMatrixVerdict(rows: ScoredMatrixRow[]): Map<string, MatrixVerdict> {
  const verdicts = new Map<string, MatrixVerdict>();

  if (rows.length === 0) {
    return verdicts;
  }

  const baseQuality = rows
    .filter((row) => !row.isFineTuned && !Number.isNaN(row.qualityScore))
    .reduce((max, row) => Math.max(max, row.qualityScore), 0);

  const shipThis = rows.find((row) => row.isFineTuned && row.qualityScore > baseQuality);

  if (shipThis) {
    verdicts.set(shipThis.id, "Ship This");
  }

  const bestValue = rows.reduce((best, row) => {
    const ratio = row.qualityScore / Math.max(row.costPer1kTokens, 0.0001);
    if (!best || ratio > best.ratio) {
      return { id: row.id, ratio };
    }

    return best;
  }, null as null | { id: string; ratio: number });

  const mostCapable = rows.reduce((best, row) => {
    return !best || row.qualityScore > best.qualityScore ? row : best;
  }, null as null | ScoredMatrixRow);

  const mostAffordable = rows.reduce((best, row) => {
    return !best || row.costPer1kTokens < best.costPer1kTokens ? row : best;
  }, null as null | ScoredMatrixRow);

  rows.forEach((row) => {
    if (verdicts.has(row.id)) {
      return;
    }

    if (bestValue?.id === row.id) {
      verdicts.set(row.id, "Best Value");
      return;
    }

    if (mostCapable?.id === row.id) {
      verdicts.set(row.id, "Most Capable");
      return;
    }

    if (mostAffordable?.id === row.id) {
      verdicts.set(row.id, "Most Affordable");
      return;
    }

    verdicts.set(row.id, "Recommended");
  });

  return verdicts;
}

export function buildExperimentMatrix(
  candidates: ExperimentMatrixCandidate[],
): ExperimentMatrixRow[] {
  const supportedCandidates = candidates
    .filter((candidate) => isSupportedModelId(candidate.model))
    .map((candidate) => ({
      id: candidate.id,
      model: candidate.model as SupportedModelId,
      qualityScore: candidate.qualityScore,
      isFineTuned: candidate.isFineTuned,
      costPer1kTokens: getCostPer1kTokens(candidate.model as SupportedModelId),
      latencyP50: getLatencyP50Ms(candidate.model as SupportedModelId),
    }));

  const verdicts = getMatrixVerdict(supportedCandidates);

  return supportedCandidates.map((candidate) => ({
    ...candidate,
    verdict: verdicts.get(candidate.id) ?? "Recommended",
  }));
}
