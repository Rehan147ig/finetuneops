import { describe, expect, it, vi, beforeEach } from "vitest";
import { runAutoEval, jaccardSimilarity } from "./auto-eval-engine";
import { prisma } from "./prisma";
import { getActiveCredential } from "./provider-credentials";
import { recordActivityEvent } from "./workspace-data";

vi.mock("./prisma", () => ({
  prisma: {
    datasetExample: { count: vi.fn() },
    dataset: { findUnique: vi.fn() },
    evalRun: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("./provider-credentials", () => ({
  getActiveCredential: vi.fn(),
}));

vi.mock("./workspace-data", () => ({
  recordActivityEvent: vi.fn(),
}));

const mockOpenAiCreate = vi.fn();

vi.mock("openai", () => {
  return {
    OpenAI: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockOpenAiCreate,
        },
      },
    })),
  };
});

describe("auto-eval-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("jaccardSimilarity", () => {
    it("returns 1.0 for exact matches", () => {
      expect(jaccardSimilarity("hello world", "hello world")).toBe(1.0);
    });

    it("returns 0.0 for completely different strings", () => {
      expect(jaccardSimilarity("hello world", "foo bar")).toBe(0.0);
    });

    it("returns partial match score", () => {
      const score = jaccardSimilarity("hello world", "hello beautiful world");
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });

  describe("runAutoEval", () => {
    const input = {
      projectId: "proj_1",
      trainingJobId: "job_1",
      datasetId: "ds_1",
      modelId: "model_1",
      organizationId: "org_1",
    };

    it("throws if dataset is empty", async () => {
      vi.mocked(getActiveCredential).mockResolvedValue("test_key");
      vi.mocked(prisma.dataset.findUnique).mockResolvedValue({ id: "ds_1", examples: [] } as any);
      vi.mocked(prisma.datasetExample.count).mockResolvedValue(0);
      await expect(runAutoEval(input)).rejects.toThrow("Dataset is empty or not found.");
    });

    it("throws if no active credential", async () => {
      vi.mocked(prisma.dataset.findUnique).mockResolvedValue({
        id: "ds_1",
      } as any);
      vi.mocked(prisma.datasetExample.count).mockResolvedValue(1);
      vi.mocked(getActiveCredential).mockResolvedValue(null);

      await expect(runAutoEval(input)).rejects.toThrow("No active OpenAI credential found.");
    });

    it("handles happy path and calculates scores", async () => {
      vi.mocked(prisma.dataset.findUnique).mockResolvedValue({
        id: "ds_1",
        examples: [
          { id: "ex_1", inputText: "in1", outputText: "exact match" },
          { id: "ex_2", inputText: "in2", outputText: "partial match here" },
        ],
      } as any);
      vi.mocked(prisma.datasetExample.count).mockResolvedValue(2);

      vi.mocked(getActiveCredential).mockResolvedValue("test_key");
      vi.mocked(prisma.evalRun.create).mockResolvedValue({ id: "eval_1" } as any);

      // Each example triggers: (1) model call, (2) LLM-judge call
      // ex_1: model returns exact match → exact=1.0, jaccard=1.0; judge scores 10/10
      // ex_2: model returns "partial mismatch here" → exact=0.0, jaccard~partial; judge scores 5/10
      mockOpenAiCreate
        .mockResolvedValueOnce({ choices: [{ message: { content: "exact match" } }] })         // ex_1 model
        .mockResolvedValueOnce({ choices: [{ message: { content: '{"score": 10}' } }] })       // ex_1 judge
        .mockResolvedValueOnce({ choices: [{ message: { content: "partial mismatch here" } }] }) // ex_2 model
        .mockResolvedValueOnce({ choices: [{ message: { content: '{"score": 5}' } }] });       // ex_2 judge

      const result = await runAutoEval(input);

      expect(prisma.evalRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "eval_1" },
          data: expect.objectContaining({ status: "completed" }),
        })
      );

      expect(recordActivityEvent).toHaveBeenCalled();
      // llmJudgeScore = (1.0 + 0.5) / 2 = 0.75
      // jaccardScore = (1.0 + jaccard("partial mismatch here","partial match here")) / 2
      // The exact score value depends on Jaccard, so check shape + plausible range
      expect(result.evalRunId).toBe("eval_1");
      expect(result.sampledCount).toBe(2);
      expect(result.totalCount).toBe(2);
      expect(result.score).toBeGreaterThan(50);   // blend of 0.75 LLM + jaccard > 50%
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.scores).toHaveProperty("exact_match");
      expect(result.scores).toHaveProperty("jaccard_similarity");
      expect(result.scores).toHaveProperty("llm_judge");
    });

    it("handles API errors gracefully and returns 0 score if all fail", async () => {
      vi.mocked(prisma.dataset.findUnique).mockResolvedValue({
        id: "ds_1",
        examples: [
          { id: "ex_1", inputText: "in1", outputText: "out1" },
        ],
      } as any);

      vi.mocked(getActiveCredential).mockResolvedValue("test_key");
      vi.mocked(prisma.evalRun.create).mockResolvedValue({ id: "eval_1" } as any);

      mockOpenAiCreate.mockRejectedValue(new Error("API Error"));

      const result = await runAutoEval(input);

      expect(prisma.evalRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "failed", score: 0 },
        })
      );
      expect(result.score).toBe(0);
      expect(result.errorMessage).toBe("All evaluation samples failed.");
    });
  });
});
