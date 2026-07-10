import { describe, expect, it } from "vitest";
import { importLangSmithRuns } from "../src/langsmith-import";

describe("LangSmith import", () => {
  it("converts LangSmith runs into release-aware eval cases", () => {
    const cases = importLangSmithRuns([
      {
        id: "run-1",
        name: "support-agent",
        run_type: "chain",
        inputs: { question: "Can I cancel my plan?" },
        outputs: { answer: "Yes, you can cancel from billing." },
        start_time: "2026-07-10T10:00:00.000Z",
        end_time: "2026-07-10T10:00:01.250Z",
        extra: {
          metadata: { prompt_version: "support-v2" },
          invocation_params: { model: "gpt-4.1-mini" },
        },
        feedback_stats: { correctness: { score: 0.8 } },
        tags: ["release:2026-07-10"],
      },
    ], { scoreKey: "correctness" });

    expect(cases).toEqual([
      expect.objectContaining({
        id: "run-1",
        input: "Can I cancel my plan?",
        output: "Yes, you can cancel from billing.",
        score: 0.8,
        model: "gpt-4.1-mini",
        promptVersion: "support-v2",
        latency_ms: 1250,
      }),
    ]);
  });

  it("uses failed runs as failed eval cases and skips child tool runs", () => {
    const cases = importLangSmithRuns([
      { id: "root", run_type: "llm", inputs: { input: "Help" }, error: "rate limited" },
      { id: "tool", run_type: "tool", inputs: { input: "ignored" } },
    ]);

    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ id: "root", score: 0, passed: false });
  });

  it("does not turn an unscored trace into a passing evaluation", () => {
    const [item] = importLangSmithRuns([
      { id: "unscored", run_type: "chain", inputs: { input: "Help" } },
    ]);

    expect(item.score).toBeUndefined();
    expect(item.passed).toBeUndefined();
  });
});
