import OpenAI from "openai";
import { logger } from "@/lib/logger";

export type TraCategory =
  | "instruction_conflict"
  | "label_noise"
  | "duplicate_conflict"
  | "class_imbalance";

export type TraDatasetExample = {
  id: string;
  inputText: string;
  outputText?: string | null;
  metadata?: string | null;
};

export type TraSuspiciousExample = {
  exampleId: string;
  exampleIndex: number;
  confidence: number;
  reason: string;
  category: TraCategory;
  impactScore: number;
  inputPreview?: string;
  outputPreview?: string;
};

export type TraAnalysisInput = {
  regressionMetric: string;
  baselineScore: number;
  candidateScore: number;
  delta: number;
  examples: TraDatasetExample[];
};

export type TraAnalysisResult = {
  confidence: number;
  rootCauseCategory: TraCategory | "unknown";
  summary: string;
  recommendedAction: string;
  /** Qualitative impact rating replacing the previous fake estimatedRecovery percentage. */
  impactRating: "LOW" | "MEDIUM" | "HIGH";
  suspiciousExamples: TraSuspiciousExample[];
  limitedMode: boolean;
  /** How many examples were in the dataset. */
  totalExamples: number;
  /** How many examples were sampled for label-noise detection. */
  labelNoiseSampleSize: number;
  /** Whether the duplicate scan was limited to a sample due to dataset size. */
  duplicateScanSampled: boolean;
};

type OpenAiLike = {
  chat: {
    completions: {
      create: (input: {
        model: string;
        temperature: number;
        response_format: { type: "json_object" };
        messages: Array<{ role: "system" | "user"; content: string }>;
      }) => Promise<{
        choices?: Array<{
          message?: {
            content?: string | null;
          };
        }>;
      }>;
    };
  };
};

const BATCH_SIZE = 8;
/** Increased from 40 → 200 for better coverage on large datasets. */
const LABEL_NOISE_SAMPLE_SIZE = 200;
const MAX_SUSPICIOUS_EXAMPLES = 10;
/** Datasets larger than this are sampled for O(n²) duplicate detection. */
const DUPLICATE_SCAN_CAP = 3_000;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function preview(value: string | null | undefined, maxLength = 240) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
}

function normalizeTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function jaccardSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeTokens(left));
  const rightTokens = new Set(normalizeTokens(right));
  const union = new Set([...leftTokens, ...rightTokens]);

  if (union.size === 0) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  return intersection.length / union.size;
}

function normalizedOutput(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

// RULE 2: TRA must NEVER read the platform's OPENAI_API_KEY.
// The LLM judge uses the customer's own provider credential, which the worker
// looks up via getActiveCredential() and passes in here. When no credential is
// supplied, TRA runs statistical-only (duplicate + class-imbalance) and reports
// limitedMode so the UI can tell the user why two techniques were skipped.
function createOpenAiClient(customerApiKey?: string): OpenAiLike | null {
  if (!customerApiKey) {
    return null;
  }

  return new OpenAI({
    apiKey: customerApiKey,
    timeout: 15_000,
  }) as OpenAiLike;
}

function parseJudgeResponse(
  content: string | null | undefined,
  category: TraCategory,
  exampleIndexById: Map<string, number>,
  exampleById: Map<string, TraDatasetExample>,
): TraSuspiciousExample[] {
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as {
      suspicious?: Array<{
        id?: string;
        confidence?: number;
        reason?: string;
        impactScore?: number;
      }>;
    };

    if (!Array.isArray(parsed.suspicious)) {
      return [];
    }

    return parsed.suspicious.flatMap((item) => {
      if (!item.id || !exampleById.has(item.id)) {
        return [];
      }

      const example = exampleById.get(item.id);
      const confidence = clamp01(Number(item.confidence ?? 0));
      const impactScore = clamp01(Number(item.impactScore ?? confidence));

      if (!example || confidence < 0.5) {
        return [];
      }

      return [
        {
          exampleId: item.id,
          exampleIndex: exampleIndexById.get(item.id) ?? 0,
          confidence,
          reason: item.reason || "The judge marked this example as suspicious.",
          category,
          impactScore,
          inputPreview: preview(example.inputText),
          outputPreview: preview(example.outputText),
        },
      ];
    });
  } catch (error) {
    logger.warn({
      event: "tra_judge_parse_failed",
      category,
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}

async function judgeExamples(input: {
  client: OpenAiLike | null;
  category: TraCategory;
  systemPrompt: string;
  userPrompt: string;
  examples: TraDatasetExample[];
  exampleIndexById: Map<string, number>;
  exampleById: Map<string, TraDatasetExample>;
}) {
  if (!input.client || input.examples.length === 0) {
    return [];
  }

  const batches = chunk(input.examples, BATCH_SIZE);
  const results: TraSuspiciousExample[] = [];
  
  // CONCURRENCY OPTIMIZATION: Process a maximum of 4 batches in parallel
  // to avoid triggering 429 Rate Limits from OpenAI, while staying fast.
  const CONCURRENCY = 4;
  const batchChunks = chunk(batches, CONCURRENCY);

  for (const batchChunk of batchChunks) {
    const settled = await Promise.allSettled(
      batchChunk.map(async (batch) => {
        const response = await input.client?.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0,
          response_format: {
            type: "json_object",
          },
          messages: [
            {
              role: "system",
              content: input.systemPrompt,
            },
            {
              role: "user",
              content: [
                input.userPrompt,
                "Return only JSON in this shape:",
                '{"suspicious":[{"id":"example_id","confidence":0.0,"reason":"short reason","impactScore":0.0}]}',
                JSON.stringify({
                  examples: batch.map((example) => ({
                    id: example.id,
                    input: example.inputText,
                    output: example.outputText ?? "",
                  })),
                }),
              ].join("\n\n"),
            },
          ],
        });

        return parseJudgeResponse(
          response?.choices?.[0]?.message?.content,
          input.category,
          input.exampleIndexById,
          input.exampleById,
        );
      })
    );

    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(...result.value);
      } else {
        logger.warn({
          event: "tra_judge_batch_failed",
          category: input.category,
          error: result.reason instanceof Error ? result.reason.message : "unknown",
        });
      }
    }
  }

  return results;
}

export async function instructionConflictDetection(
  examples: TraDatasetExample[],
  client: OpenAiLike | null = createOpenAiClient(),
): Promise<TraSuspiciousExample[]> {
  const exampleById = new Map(examples.map((example) => [example.id, example]));
  const exampleIndexById = new Map(examples.map((example, index) => [example.id, index]));

  return judgeExamples({
    client,
    category: "instruction_conflict",
    examples,
    exampleById,
    exampleIndexById,
    systemPrompt:
      "You are a training-data auditor. Find examples where the input instruction contradicts the output label or response. Be conservative.",
    userPrompt:
      "Flag examples where the requested behavior and output conflict, such as refusing when the instruction asks for a safe answer, approving when the instruction asks to reject, or changing policy intent.",
  });
}

export async function labelNoiseDetection(
  examples: TraDatasetExample[],
  client: OpenAiLike | null = createOpenAiClient(),
): Promise<TraSuspiciousExample[]> {
  const sampled = examples.slice(0, LABEL_NOISE_SAMPLE_SIZE);
  const exampleById = new Map(sampled.map((example) => [example.id, example]));
  const exampleIndexById = new Map(examples.map((example, index) => [example.id, index]));

  return judgeExamples({
    client,
    category: "label_noise",
    examples: sampled,
    exampleById,
    exampleIndexById,
    systemPrompt:
      "You are a deterministic eval judge. Find training examples where the output label or assistant answer does not make sense for the input.",
    userPrompt:
      "Flag likely mislabeled examples. Ignore style differences. Focus on labels or answers that would teach the fine-tune the wrong behavior.",
  });
}

export function duplicateConflictFinder(examples: TraDatasetExample[]): {
  suspicious: TraSuspiciousExample[];
  sampled: boolean;
} {
  const suspicious: TraSuspiciousExample[] = [];
  const SIMILARITY_THRESHOLD = 0.72;

  // With the new O(N*K) optimization, we can safely increase the cap.
  const INCREASED_SCAN_CAP = 10_000;
  const sampled = examples.length > INCREASED_SCAN_CAP;
  const scanSet = sampled ? examples.slice(0, INCREASED_SCAN_CAP) : examples;

  const processed = scanSet.map((ex, originalIndex) => ({
    id: ex.id,
    originalIndex,
    inputText: ex.inputText,
    tokens: new Set(normalizeTokens(ex.inputText)),
    output: normalizedOutput(ex.outputText),
  }));

  // ALGORITHM OPTIMIZATION: Sort by token size ascending.
  // This allows the inner loop to break early because if the left string is 
  // vastly shorter than the right string, Jaccard similarity cannot exceed the threshold.
  processed.sort((a, b) => a.tokens.size - b.tokens.size);

  for (let leftIndex = 0; leftIndex < processed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < processed.length; rightIndex += 1) {
      const left = processed[leftIndex];
      const right = processed[rightIndex];

      // Early Break: If the difference in size makes similarity mathematically impossible,
      // we can break the inner loop entirely because the rest of the array is even larger!
      if (left.tokens.size / Math.max(1, right.tokens.size) < SIMILARITY_THRESHOLD) {
        break; 
      }

      if (!left.output || !right.output || left.output === right.output) {
        continue;
      }

      let intersectionSize = 0;
      for (const token of left.tokens) {
        if (right.tokens.has(token)) intersectionSize++;
      }

      const unionSize = left.tokens.size + right.tokens.size - intersectionSize;
      const similarity = unionSize === 0 ? 0 : intersectionSize / unionSize;

      if (similarity < SIMILARITY_THRESHOLD) {
        continue;
      }

      const confidence = clamp01(0.65 + similarity * 0.25);
      
      suspicious.push({
        exampleId: left.id,
        exampleIndex: left.originalIndex,
        confidence,
        reason: `Near-duplicate input conflicts with example ${right.originalIndex + 1}; outputs disagree.`,
        category: "duplicate_conflict",
        impactScore: clamp01(confidence + 0.05),
        inputPreview: preview(left.inputText),
        outputPreview: preview(examples[left.originalIndex].outputText),
      });
      suspicious.push({
        exampleId: right.id,
        exampleIndex: right.originalIndex,
        confidence,
        reason: `Near-duplicate input conflicts with example ${left.originalIndex + 1}; outputs disagree.`,
        category: "duplicate_conflict",
        impactScore: clamp01(confidence + 0.05),
        inputPreview: preview(right.inputText),
        outputPreview: preview(examples[right.originalIndex].outputText),
      });
    }
  }

  return { suspicious, sampled };
}

export function classImbalanceDetection(input: {
  examples: TraDatasetExample[];
  regressionMetric: string;
}): TraSuspiciousExample[] {
  const labelCounts = new Map<string, number>();
  const labels = input.examples.map((example) => {
    const label = normalizedOutput(example.outputText).slice(0, 120) || "empty_output";
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    return label;
  });

  const total = input.examples.length;
  if (total < 5) {
    return [];
  }

  const minHealthyCount = Math.max(2, Math.ceil(total * 0.1));
  const metricBoost = /recall|minority|coverage|safety|hallucination/i.test(input.regressionMetric)
    ? 0.1
    : 0;

  return input.examples.flatMap((example, index) => {
    const label = labels[index];
    const count = labelCounts.get(label) ?? 0;

    if (count >= minHealthyCount) {
      return [];
    }

    const rarity = 1 - count / minHealthyCount;
    const confidence = clamp01(0.55 + rarity * 0.25 + metricBoost);

    return [
      {
        exampleId: example.id,
        exampleIndex: index,
        confidence,
        reason: `Output class "${label}" has only ${count} example${count === 1 ? "" : "s"}; this can destabilize ${input.regressionMetric}.`,
        category: "class_imbalance" as const,
        impactScore: clamp01(confidence - 0.05),
        inputPreview: preview(example.inputText),
        outputPreview: preview(example.outputText),
      },
    ];
  });
}

export function rankAndDeduplicateSuspiciousExamples(
  examples: TraSuspiciousExample[],
  limit = MAX_SUSPICIOUS_EXAMPLES,
): TraSuspiciousExample[] {
  const byExample = new Map<string, TraSuspiciousExample>();

  for (const example of examples) {
    const existing = byExample.get(example.exampleId);
    const normalized = {
      ...example,
      confidence: clamp01(example.confidence),
      impactScore: clamp01(example.impactScore),
    };

    if (
      !existing ||
      normalized.impactScore > existing.impactScore ||
      (normalized.impactScore === existing.impactScore && normalized.confidence > existing.confidence)
    ) {
      byExample.set(example.exampleId, normalized);
    }
  }

  return [...byExample.values()]
    .sort((left, right) => {
      if (right.impactScore !== left.impactScore) {
        return right.impactScore - left.impactScore;
      }

      return right.confidence - left.confidence;
    })
    .slice(0, limit);
}

function summarizeRootCause(suspiciousExamples: TraSuspiciousExample[]): {
  category: TraCategory | "unknown";
  confidence: number;
  impactRating: "LOW" | "MEDIUM" | "HIGH";
} {
  if (suspiciousExamples.length === 0) {
    return {
      category: "unknown",
      confidence: 0,
      impactRating: "LOW",
    };
  }

  const categoryScores = new Map<TraCategory, number>();
  for (const example of suspiciousExamples) {
    categoryScores.set(example.category, (categoryScores.get(example.category) ?? 0) + example.impactScore);
  }

  const category =
    [...categoryScores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "unknown";
  const topThree = suspiciousExamples.slice(0, 3);
  const confidence = topThree.reduce((sum, example) => sum + example.confidence, 0) / topThree.length;

  // Qualitative rating: based on count of high-confidence suspicious examples.
  // This replaces the previous fake formula min(0.4, sum/20) which had no empirical basis.
  const highConfidenceCount = suspiciousExamples.filter(e => e.confidence >= 0.75).length;
  const impactRating: "LOW" | "MEDIUM" | "HIGH" =
    highConfidenceCount >= 4 ? "HIGH" :
    highConfidenceCount >= 2 ? "MEDIUM" :
    "LOW";

  return {
    category,
    confidence: Number(confidence.toFixed(3)),
    impactRating,
  };
}

function categoryLabel(category: TraCategory | "unknown") {
  return category
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export async function runTraAnalysis(
  input: TraAnalysisInput,
  customerApiKeyOrClient?: string | OpenAiLike | null,
): Promise<TraAnalysisResult> {
  const client =
    typeof customerApiKeyOrClient === "object" && customerApiKeyOrClient
      ? customerApiKeyOrClient
      : createOpenAiClient(customerApiKeyOrClient ?? undefined);
  const limitedMode = !client;
  const totalExamples = input.examples.length;
  const labelNoiseSampleSize = Math.min(LABEL_NOISE_SAMPLE_SIZE, totalExamples);

  const [instructionConflicts, labelNoise] = await Promise.all([
    instructionConflictDetection(input.examples, client),
    labelNoiseDetection(input.examples, client),
  ]);
  const { suspicious: duplicateConflicts, sampled: duplicateScanSampled } =
    duplicateConflictFinder(input.examples);
  const classImbalance = classImbalanceDetection({
    examples: input.examples,
    regressionMetric: input.regressionMetric,
  });
  const suspiciousExamples = rankAndDeduplicateSuspiciousExamples([
    ...instructionConflicts,
    ...labelNoise,
    ...duplicateConflicts,
    ...classImbalance,
  ]);
  const rootCause = summarizeRootCause(suspiciousExamples);

  if (suspiciousExamples.length === 0) {
    return {
      confidence: 0,
      rootCauseCategory: "unknown",
      summary: `TRA did not find a likely data root cause for ${input.regressionMetric}.`,
      recommendedAction: "Review eval cases manually and run TRA again after adding more labeled examples.",
      impactRating: "LOW",
      suspiciousExamples: [],
      limitedMode,
      totalExamples,
      labelNoiseSampleSize,
      duplicateScanSampled,
    };
  }

  return {
    confidence: rootCause.confidence,
    rootCauseCategory: rootCause.category,
    summary: `${
      limitedMode ? "[Limited Mode] " : ""
    }${categoryLabel(rootCause.category)} is the most likely cause of the ${
      input.regressionMetric
    } regression from ${input.baselineScore} to ${input.candidateScore}.`,
    recommendedAction:
      "Review the top suspicious examples, remove or relabel confirmed bad rows, then create a cleaned dataset version before retraining.",
    impactRating: rootCause.impactRating,
    suspiciousExamples,
    limitedMode,
    totalExamples,
    labelNoiseSampleSize,
    duplicateScanSampled,
  };
}
