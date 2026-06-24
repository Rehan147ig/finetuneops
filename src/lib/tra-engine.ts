import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";
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
  estimatedRecovery: number;
  suspiciousExamples: TraSuspiciousExample[];
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
const LABEL_NOISE_SAMPLE_SIZE = 40;
const MAX_SUSPICIOUS_EXAMPLES = 10;

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

function createOpenAiClient(): OpenAiLike | null {
  const apiKey = getServerEnv().OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new OpenAI({
    apiKey,
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
  const settled = await Promise.allSettled(
    batches.map(async (batch) => {
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
    }),
  );

  return settled.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    logger.warn({
      event: "tra_judge_batch_failed",
      category: input.category,
      error: result.reason instanceof Error ? result.reason.message : "unknown",
    });
    return [];
  });
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

export function duplicateConflictFinder(examples: TraDatasetExample[]): TraSuspiciousExample[] {
  const suspicious: TraSuspiciousExample[] = [];

  for (let leftIndex = 0; leftIndex < examples.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < examples.length; rightIndex += 1) {
      const left = examples[leftIndex];
      const right = examples[rightIndex];
      const similarity = jaccardSimilarity(left.inputText, right.inputText);
      const leftOutput = normalizedOutput(left.outputText);
      const rightOutput = normalizedOutput(right.outputText);

      if (similarity < 0.72 || !leftOutput || !rightOutput || leftOutput === rightOutput) {
        continue;
      }

      const confidence = clamp01(0.65 + similarity * 0.25);
      const reason = `Near-duplicate input conflicts with example ${rightIndex + 1}; outputs disagree.`;

      suspicious.push({
        exampleId: left.id,
        exampleIndex: leftIndex,
        confidence,
        reason,
        category: "duplicate_conflict",
        impactScore: clamp01(confidence + 0.05),
        inputPreview: preview(left.inputText),
        outputPreview: preview(left.outputText),
      });
      suspicious.push({
        exampleId: right.id,
        exampleIndex: rightIndex,
        confidence,
        reason: `Near-duplicate input conflicts with example ${leftIndex + 1}; outputs disagree.`,
        category: "duplicate_conflict",
        impactScore: clamp01(confidence + 0.05),
        inputPreview: preview(right.inputText),
        outputPreview: preview(right.outputText),
      });
    }
  }

  return suspicious;
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
  estimatedRecovery: number;
} {
  if (suspiciousExamples.length === 0) {
    return {
      category: "unknown",
      confidence: 0,
      estimatedRecovery: 0,
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
  const estimatedRecovery = Math.min(
    0.4,
    suspiciousExamples.reduce((sum, example) => sum + example.impactScore, 0) / 20,
  );

  return {
    category,
    confidence: Number(confidence.toFixed(3)),
    estimatedRecovery: Number(estimatedRecovery.toFixed(3)),
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
  client: OpenAiLike | null = createOpenAiClient(),
): Promise<TraAnalysisResult> {
  const [instructionConflicts, labelNoise] = await Promise.all([
    instructionConflictDetection(input.examples, client),
    labelNoiseDetection(input.examples, client),
  ]);
  const duplicateConflicts = duplicateConflictFinder(input.examples);
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
      estimatedRecovery: 0,
      suspiciousExamples: [],
    };
  }

  return {
    confidence: rootCause.confidence,
    rootCauseCategory: rootCause.category,
    summary: `${categoryLabel(rootCause.category)} is the most likely cause of the ${input.regressionMetric} regression from ${input.baselineScore} to ${input.candidateScore}.`,
    recommendedAction:
      "Review the top suspicious examples, remove or relabel confirmed bad rows, then create a cleaned dataset version before retraining.",
    estimatedRecovery: rootCause.estimatedRecovery,
    suspiciousExamples,
  };
}
