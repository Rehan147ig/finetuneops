import { estimateFineTuneCost } from "@/lib/cost-estimator";

export type QualityExample = {
  id: string;
  input: string;
  output?: string | null;
};

export type DuplicateCheckResult = {
  exactDuplicates: number;
  nearDuplicates: number;
  pairs: Array<{ leftId: string; rightId: string; similarity: number; type: "exact" | "near" }>;
};

export type LengthCheckResult = {
  tooShort: number;
  tooLong: number;
  flagged: Array<{ id: string; field: "input" | "output"; reason: "too_short" | "too_long" }>;
};

export type PiiCheckResult = {
  detected: number;
  categories: Record<"email" | "phone" | "ssn" | "credit_card", number>;
  flagged: Array<{ id: string; categories: string[] }>;
};

export type LabelBalanceResult = {
  categories: Record<string, number>;
  balanced: boolean;
  warnings: string[];
};

export type LanguageConsistencyResult = {
  dominantLanguage: string;
  mixed: number;
  flagged: Array<{ id: string; language: string }>;
};

export type EmptyOutputResult = {
  count: number;
  flagged: string[];
};

export type DatasetQualityResult = {
  totalExamples: number;
  goodExamples: number;
  healthScore: number;
  exactDuplicates: number;
  nearDuplicates: number;
  piiDetected: number;
  tooShort: number;
  tooLong: number;
  emptyOutputs: number;
  imbalanced: boolean;
  languageMixed: number;
  details: {
    duplicates: DuplicateCheckResult;
    length: LengthCheckResult;
    pii: PiiCheckResult;
    labelBalance: LabelBalanceResult;
    language: LanguageConsistencyResult;
    emptyOutputs: EmptyOutputResult;
  };
  recommendation: string;
  estimatedCost: number;
  projectedSaving: number;
};

function uniqueTrigrams(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
  const grams = new Set<string>();

  if (normalized.length < 3) {
    grams.add(normalized);
    return grams;
  }

  for (let index = 0; index <= normalized.length - 3; index += 1) {
    grams.add(normalized.slice(index, index + 3));
  }

  return grams;
}

function jaccardSimilarity(left: string, right: string) {
  const leftGrams = uniqueTrigrams(left);
  const rightGrams = uniqueTrigrams(right);
  const intersection = [...leftGrams].filter((gram) => rightGrams.has(gram)).length;
  const union = new Set([...leftGrams, ...rightGrams]).size;

  return union === 0 ? 0 : intersection / union;
}

export function checkDuplicateDetection(examples: QualityExample[]): DuplicateCheckResult {
  const pairs: DuplicateCheckResult["pairs"] = [];

  for (let leftIndex = 0; leftIndex < examples.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < examples.length; rightIndex += 1) {
      const left = examples[leftIndex];
      const right = examples[rightIndex];
      const exact = left.input.trim() === right.input.trim();

      if (exact) {
        pairs.push({
          leftId: left.id,
          rightId: right.id,
          similarity: 1,
          type: "exact",
        });
        continue;
      }

      const similarity = jaccardSimilarity(left.input, right.input);
      if (similarity > 0.9) {
        pairs.push({
          leftId: left.id,
          rightId: right.id,
          similarity: Number(similarity.toFixed(3)),
          type: "near",
        });
      }
    }
  }

  return {
    exactDuplicates: pairs.filter((pair) => pair.type === "exact").length,
    nearDuplicates: pairs.filter((pair) => pair.type === "near").length,
    pairs,
  };
}

export function checkLengthAnalysis(examples: QualityExample[]): LengthCheckResult {
  const flagged: LengthCheckResult["flagged"] = [];

  for (const example of examples) {
    if (example.input.length < 10) {
      flagged.push({ id: example.id, field: "input", reason: "too_short" });
    }
    if (example.input.length > 8000) {
      flagged.push({ id: example.id, field: "input", reason: "too_long" });
    }

    const output = example.output ?? "";
    if (output.length > 0 && output.length < 5) {
      flagged.push({ id: example.id, field: "output", reason: "too_short" });
    }
    if (output.length > 4000) {
      flagged.push({ id: example.id, field: "output", reason: "too_long" });
    }
  }

  return {
    tooShort: flagged.filter((item) => item.reason === "too_short").length,
    tooLong: flagged.filter((item) => item.reason === "too_long").length,
    flagged,
  };
}

export function checkPiiDetection(examples: QualityExample[]): PiiCheckResult {
  const regexMap = {
    email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    phone: /\+?\d[\d\s().-]{7,}\d/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    credit_card: /\b(?:\d[ -]*?){13,16}\b/g,
  } as const;

  const categories = {
    email: 0,
    phone: 0,
    ssn: 0,
    credit_card: 0,
  };
  const flagged: PiiCheckResult["flagged"] = [];

  for (const example of examples) {
    const haystack = `${example.input}\n${example.output ?? ""}`;
    const hits: string[] = [];

    for (const [category, regex] of Object.entries(regexMap) as Array<[keyof typeof regexMap, RegExp]>) {
      if (regex.test(haystack)) {
        categories[category] += 1;
        hits.push(category);
      }
    }

    if (hits.length > 0) {
      flagged.push({
        id: example.id,
        categories: hits,
      });
    }
  }

  return {
    detected: flagged.length,
    categories,
    flagged,
  };
}

export function checkLabelBalance(examples: QualityExample[]): LabelBalanceResult {
  const categories: Record<string, number> = {};

  for (const example of examples) {
    const output = (example.output ?? "").trim();
    if (!output) {
      continue;
    }
    categories[output] = (categories[output] ?? 0) + 1;
  }

  const total = Object.values(categories).reduce((sum, count) => sum + count, 0);
  const warnings: string[] = [];

  for (const [label, count] of Object.entries(categories)) {
    if (total > 0 && count / total > 0.8) {
      warnings.push(`${label} dominates more than 80% of the dataset.`);
    }
    if (count < 5) {
      warnings.push(`${label} has fewer than 5 examples.`);
    }
  }

  return {
    categories,
    balanced: warnings.length === 0,
    warnings,
  };
}

function detectLanguage(value: string) {
  const latinChars = (value.match(/[A-Za-z]/g) ?? []).length;
  const nonLatinChars = (value.match(/[^\u0000-\u007F]/g) ?? []).length;

  if (latinChars > 0 && nonLatinChars === 0) {
    return "latin";
  }
  if (nonLatinChars > latinChars) {
    return "non_latin";
  }
  if (latinChars === 0 && nonLatinChars === 0) {
    return "unknown";
  }

  return "mixed";
}

export function checkLanguageConsistency(examples: QualityExample[]): LanguageConsistencyResult {
  const counts: Record<string, number> = {};
  const languages = examples.map((example) => ({
    id: example.id,
    language: detectLanguage(example.input),
  }));

  for (const entry of languages) {
    counts[entry.language] = (counts[entry.language] ?? 0) + 1;
  }

  const dominantLanguage =
    Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "unknown";
  const flagged = languages.filter((entry) => entry.language !== dominantLanguage);

  return {
    dominantLanguage,
    mixed: flagged.length,
    flagged,
  };
}

export function checkEmptyOutputs(examples: QualityExample[]): EmptyOutputResult {
  const flagged = examples
    .filter((example) => !example.output || example.output.trim().length === 0)
    .map((example) => example.id);

  return {
    count: flagged.length,
    flagged,
  };
}

export function calculateHealthScore(input: {
  duplicates: DuplicateCheckResult;
  pii: PiiCheckResult;
  length: LengthCheckResult;
  labelBalance: LabelBalanceResult;
  emptyOutputs: EmptyOutputResult;
}) {
  const penalties =
    Math.min(input.duplicates.exactDuplicates * 2, 20) +
    Math.min(input.duplicates.nearDuplicates, 10) +
    Math.min(input.pii.detected * 5, 30) +
    Math.min((input.length.tooShort + input.length.tooLong) * 0.5, 10) +
    (input.labelBalance.balanced ? 0 : 15) +
    Math.min(input.emptyOutputs.count * 3, 15);

  return Math.max(0, Math.min(100, Math.round(100 - penalties)));
}

export function generateRecommendation(input: {
  duplicates: DuplicateCheckResult;
  pii: PiiCheckResult;
  projectedSaving: number;
}) {
  const parts: string[] = [];

  if (input.duplicates.exactDuplicates > 0) {
    parts.push(`Remove ${input.duplicates.exactDuplicates} exact duplicates`);
  }
  if (input.pii.detected > 0) {
    parts.push(`${input.pii.detected} PII traces need review`);
  }

  if (parts.length === 0) {
    return "Dataset looks healthy. Minor cleanup only.";
  }

  return `${parts.join(" and ")} before training. Estimated saving: $${input.projectedSaving.toFixed(2)}`;
}

export function buildDatasetQualityReport(examples: QualityExample[]) {
  const duplicates = checkDuplicateDetection(examples);
  const length = checkLengthAnalysis(examples);
  const pii = checkPiiDetection(examples);
  const labelBalance = checkLabelBalance(examples);
  const language = checkLanguageConsistency(examples);
  const emptyOutputs = checkEmptyOutputs(examples);
  const healthScore = calculateHealthScore({
    duplicates,
    pii,
    length,
    labelBalance,
    emptyOutputs,
  });

  const flaggedIds = new Set<string>([
    ...duplicates.pairs.flatMap((pair) => [pair.leftId, pair.rightId]),
    ...length.flagged.map((item) => item.id),
    ...pii.flagged.map((item) => item.id),
    ...emptyOutputs.flagged,
    ...language.flagged.map((item) => item.id),
  ]);

  const estimatedCost = estimateFineTuneCost({
    datasetSize: examples.length,
    model: "gpt-4o-mini",
    estimatedEpochs: 3,
    datasetQuality: healthScore,
  }).estimatedCost;
  const cleanedExampleCount = Math.max(1, examples.length - flaggedIds.size);
  const cleanedCost = estimateFineTuneCost({
    datasetSize: cleanedExampleCount,
    model: "gpt-4o-mini",
    estimatedEpochs: 3,
    datasetQuality: Math.min(100, healthScore + 8),
  }).estimatedCost;
  const projectedSaving = Number(Math.max(estimatedCost - cleanedCost, 0).toFixed(2));

  return {
    totalExamples: examples.length,
    goodExamples: Math.max(examples.length - flaggedIds.size, 0),
    healthScore,
    exactDuplicates: duplicates.exactDuplicates,
    nearDuplicates: duplicates.nearDuplicates,
    piiDetected: pii.detected,
    tooShort: length.tooShort,
    tooLong: length.tooLong,
    emptyOutputs: emptyOutputs.count,
    imbalanced: !labelBalance.balanced,
    languageMixed: language.mixed,
    details: {
      duplicates,
      length,
      pii,
      labelBalance,
      language,
      emptyOutputs,
    },
    recommendation: generateRecommendation({
      duplicates,
      pii,
      projectedSaving,
    }),
    estimatedCost,
    projectedSaving,
  } satisfies DatasetQualityResult;
}
