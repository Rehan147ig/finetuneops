import { OpenAI } from "openai";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getActiveCredential } from "@/lib/provider-credentials";
import { recordActivityEvent } from "@/lib/workspace-data";

export type AutoEvalInput = {
  projectId: string;
  trainingJobId: string;
  datasetId: string;
  modelId: string;
  organizationId: string;
};

export type AutoEvalResult = {
  evalRunId: string;
  score: number;
  scores: Record<string, number>;
  /** How many examples were sampled for this evaluation. */
  sampledCount: number;
  /** Total examples in the dataset (may be larger than sampledCount). */
  totalCount: number;
  errorMessage?: string;
};

function getGrams(text: string, n = 3): Set<string> {
  const grams = new Set<string>();
  if (!text || text.length < n) return grams;
  const normalized = text.toLowerCase().trim();
  for (let i = 0; i <= normalized.length - n; i++) {
    grams.add(normalized.substring(i, i + n));
  }
  return grams;
}

export function jaccardSimilarity(textA: string, textB: string): number {
  if (!textA && !textB) return 1.0;
  if (!textA || !textB) return 0.0;
  
  const a = textA.toLowerCase().trim();
  const b = textB.toLowerCase().trim();
  if (a === b) return 1.0;

  const setA = getGrams(a);
  const setB = getGrams(b);
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

export async function runAutoEval(input: AutoEvalInput): Promise<AutoEvalResult> {
  // Check credential first — cheaper than a dataset fetch and gives a clear
  // error before doing any work.
  const apiKey = await getActiveCredential(input.organizationId, "openai");
  if (!apiKey) {
    throw new Error("No active OpenAI credential found.");
  }

  const totalCount = await prisma.datasetExample.count({
    where: { datasetId: input.datasetId },
  });

  const dataset = await prisma.dataset.findUnique({
    where: { id: input.datasetId },
    include: {
      examples: {
        orderBy: { createdAt: "desc" },
        // Increased from 30 → 100 for better coverage.
        // UI should display "Evaluated N of M examples" to be transparent.
        take: 100,
      },
    },
  });

  if (!dataset || dataset.examples.length === 0) {
    throw new Error("Dataset is empty or not found.");
  }

  const sampledCount = dataset.examples.length;

  const evalRun = await prisma.evalRun.create({
    data: {
      projectId: input.projectId,
      datasetId: input.datasetId,
      trainingJobId: input.trainingJobId,
      modelId: input.modelId,
      name: `Auto Eval: ${input.modelId}`,
      benchmark: "auto-eval",
      status: "running",
      // judge field reflects whether LLM-as-judge is active
      judge: "llm-jaccard-blend",
    },
  });

  const openai = new OpenAI({ apiKey, timeout: 15_000 });
  let exactMatchCount = 0;
  let totalJaccard = 0;
  let totalLlmScore = 0;
  let llmScoredCount = 0;
  let successfulSamples = 0;

  for (const example of dataset.examples) {
    if (!example.outputText) continue;

    try {
      const completion = await openai.chat.completions.create({
        model: input.modelId,
        messages: [{ role: "user", content: example.inputText }],
        temperature: 0,
        max_tokens: 500,
      });

      const actualOutput = completion.choices[0]?.message?.content ?? "";
      const expectedOutput = example.outputText;

      if (actualOutput.trim() === expectedOutput.trim()) {
        exactMatchCount++;
      }
      totalJaccard += jaccardSimilarity(actualOutput, expectedOutput);

      // LLM-as-judge: use gpt-4o-mini to assess semantic correctness.
      // This is far more accurate than n-gram overlap for generative tasks.
      // Uses the customer's own API key (Rule 2 compliant).
      try {
        const judgeResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You are an evaluation judge. Given an expected output and an actual model output, score the actual output from 0 to 10 based on semantic correctness and completeness. Return only a JSON object: {\"score\": <number>}",
            },
            {
              role: "user",
              content: `Expected:\n${expectedOutput}\n\nActual:\n${actualOutput}`,
            },
          ],
          response_format: { type: "json_object" },
        });
        const judgeContent = judgeResponse.choices[0]?.message?.content ?? "{}";
        const judgeResult = JSON.parse(judgeContent) as { score?: number };
        const llmScore = Math.min(10, Math.max(0, Number(judgeResult.score ?? 0))) / 10;
        totalLlmScore += llmScore;
        llmScoredCount++;
      } catch {
        // LLM judge failed for this sample — fall back to Jaccard only
      }

      successfulSamples++;
    } catch (error) {
      logger.warn({
        event: "auto_eval_sample_failed",
        exampleId: example.id,
        modelId: input.modelId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  if (successfulSamples === 0) {
    const errorMsg = "All evaluation samples failed.";
    await prisma.evalRun.update({
      where: { id: evalRun.id },
      data: { status: "failed", score: 0 },
    });
    return { evalRunId: evalRun.id, score: 0, scores: {}, sampledCount, totalCount, errorMessage: errorMsg };
  }

  const exactMatchScore = exactMatchCount / successfulSamples;
  const jaccardScore = totalJaccard / successfulSamples;

  // Blend LLM judge score with Jaccard when available.
  // llmJudge × 0.6 + jaccard × 0.4 is more semantically meaningful than
  // the previous exactMatch × 0.7 + jaccard × 0.3 which punished generative tasks.
  const llmJudgeScore = llmScoredCount > 0 ? totalLlmScore / llmScoredCount : null;
  const overallScore = llmJudgeScore !== null
    ? Math.round((llmJudgeScore * 0.6 + jaccardScore * 0.4) * 100)
    : Math.round((exactMatchScore * 0.7 + jaccardScore * 0.3) * 100);

  const scores: Record<string, number> = {
    exact_match: exactMatchScore,
    jaccard_similarity: jaccardScore,
    ...(llmJudgeScore !== null ? { llm_judge: llmJudgeScore } : {}),
  };

  await prisma.evalRun.update({
    where: { id: evalRun.id },
    data: {
      status: "completed",
      score: overallScore,
      scores: scores,
    },
  });

  await recordActivityEvent({
    projectId: input.projectId,
    type: "background_job_completed",
    message: `Auto Eval completed for model ${input.modelId} with score ${overallScore}%`,
    userId: "system",
    metadata: {
      evalRunId: evalRun.id,
      score: overallScore,
    },
  });

  return {
    evalRunId: evalRun.id,
    score: overallScore,
    scores,
    sampledCount,
    totalCount,
  };
}
