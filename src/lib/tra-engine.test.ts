import { describe, expect, it, vi } from "vitest";
import {
  duplicateConflictFinder,
  instructionConflictDetection,
  rankAndDeduplicateSuspiciousExamples,
  runTraAnalysis,
  type TraDatasetExample,
} from "./tra-engine";

function makeMockOpenAi(content: string) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content,
              },
            },
          ],
        }),
      },
    },
  };
}

const examples: TraDatasetExample[] = [
  {
    id: "ex_1",
    inputText: "Customer asks if a refund is allowed after 30 days under policy.",
    outputText: "Refund approved.",
  },
  {
    id: "ex_2",
    inputText: "Customer asks if a refund is allowed after 30 days under the policy.",
    outputText: "Refund denied.",
  },
  {
    id: "ex_3",
    inputText: "User asks for safe billing instructions.",
    outputText: "Explain the billing policy clearly.",
  },
];

describe("tra-engine", () => {
  it("instruction conflict detection parses mocked OpenAI results", async () => {
    const client = makeMockOpenAi(
      JSON.stringify({
        suspicious: [
          {
            id: "ex_3",
            confidence: 0.91,
            reason: "Output does not answer the user's requested billing instruction.",
            impactScore: 0.88,
          },
        ],
      }),
    );

    const result = await instructionConflictDetection(examples, client);

    expect(client.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        temperature: 0,
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        exampleId: "ex_3",
        category: "instruction_conflict",
        confidence: 0.91,
      }),
    ]);
  });

  it("duplicate conflict finder flags near-duplicate inputs with different outputs", () => {
    const result = duplicateConflictFinder(examples);

    expect(result.suspicious).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exampleId: "ex_1",
          category: "duplicate_conflict",
        }),
        expect.objectContaining({
          exampleId: "ex_2",
          category: "duplicate_conflict",
        }),
      ]),
    );
  });

  it("ranking deduplicates by example and keeps the highest impact candidate", () => {
    const ranked = rankAndDeduplicateSuspiciousExamples([
      {
        exampleId: "ex_1",
        exampleIndex: 0,
        confidence: 0.7,
        reason: "Lower signal",
        category: "label_noise",
        impactScore: 0.6,
      },
      {
        exampleId: "ex_1",
        exampleIndex: 0,
        confidence: 0.8,
        reason: "Higher signal",
        category: "duplicate_conflict",
        impactScore: 0.92,
      },
      {
        exampleId: "ex_2",
        exampleIndex: 1,
        confidence: 0.95,
        reason: "Also risky",
        category: "class_imbalance",
        impactScore: 0.8,
      },
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toEqual(
      expect.objectContaining({
        exampleId: "ex_1",
        reason: "Higher signal",
      }),
    );
  });

  it("runTraAnalysis combines techniques and returns a report summary", async () => {
    const client = makeMockOpenAi(
      JSON.stringify({
        suspicious: [
          {
            id: "ex_3",
            confidence: 0.86,
            reason: "The answer is too generic for the requested behavior.",
            impactScore: 0.8,
          },
        ],
      }),
    );

    const result = await runTraAnalysis(
      {
        regressionMetric: "accuracy",
        baselineScore: 0.91,
        candidateScore: 0.78,
        delta: -0.13,
        examples,
      },
      client,
    );

    expect(result.suspiciousExamples.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.summary).toContain("accuracy");
    expect(result.recommendedAction).toContain("cleaned dataset");
  });
});
