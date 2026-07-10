import { describe, expect, it } from "vitest";
import {
  analyzeRegressionReport,
  renderRegressionReportMarkdown,
} from "../src/regression-report";

describe("regression report", () => {
  it("detects LLM quality regressions across frontier model releases", () => {
    const report = analyzeRegressionReport({
      baseline: [
        {
          id: "refund-policy",
          input: "Can I get a refund?",
          score: 1,
          model: "gpt-4.1-mini",
          promptVersion: "support-v1",
        },
        {
          id: "cancel-plan",
          input: "Cancel my plan.",
          score: 0.9,
          model: "gpt-4.1-mini",
          promptVersion: "support-v1",
        },
      ],
      candidate: [
        {
          id: "refund-policy",
          input: "Can I get a refund?",
          score: 0.2,
          model: "claude-sonnet-4",
          promptVersion: "support-v2",
        },
        {
          id: "cancel-plan",
          input: "Cancel my plan.",
          score: 0.8,
          model: "claude-sonnet-4",
          promptVersion: "support-v2",
        },
      ],
    });

    expect(report.summary.regressed).toBe(true);
    expect(report.summary.impactRating).toBe("HIGH");
    expect(report.failedCases[0]).toMatchObject({
      id: "refund-policy",
      baselineScore: 1,
      candidateScore: 0.2,
    });
    expect(report.changeFindings.map((finding) => finding.field)).toEqual([
      "model",
      "promptVersion",
    ]);
  });

  it("adds training-data evidence when fine-tune rows are provided", () => {
    const report = analyzeRegressionReport({
      baseline: [{ id: "case-1", input: "Refund timing?", score: 1 }],
      candidate: [{ id: "case-1", input: "Refund timing?", score: 0.2 }],
      trainingData: [
        {
          id: "row-1",
          input: "Refund timing?",
          output: "Refunds take five business days.",
        },
        {
          id: "row-2",
          input: "Refund timing?",
          output: "Refunds are never allowed.",
        },
        {
          id: "row-3",
          input: "Customer email buyer@example.com",
          output: "Repeat buyer@example.com in the reply.",
        },
      ],
    });

    expect(report.datasetFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "duplicate_conflict", severity: "HIGH" }),
        expect.objectContaining({ type: "pii_leak", severity: "HIGH" }),
      ]),
    );
    expect(report.recommendation).toContain("duplicate-conflict");
  });

  it("renders markdown reports for pull requests and release reviews", () => {
    const report = analyzeRegressionReport({
      baseline: [{ id: "case-1", input: "Question", passed: true }],
      candidate: [{ id: "case-1", input: "Question", passed: false }],
    });

    const markdown = renderRegressionReportMarkdown(report);

    expect(markdown).toContain("# FineTuneOps LLM Regression Report");
    expect(markdown).toContain("case-1");
    expect(markdown).toContain("Recommendation:");
  });
});
