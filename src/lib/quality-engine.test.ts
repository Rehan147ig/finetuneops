import { describe, expect, it } from "vitest";
import {
  buildDatasetQualityReport,
  calculateHealthScore,
  checkDuplicateDetection,
  checkEmptyOutputs,
  checkLengthAnalysis,
  checkPiiDetection,
  generateRecommendation,
} from "@/lib/quality-engine";

describe("quality engine", () => {
  it("finds exact duplicates", () => {
    const result = checkDuplicateDetection([
      { id: "1", input: "refund policy", output: "same" },
      { id: "2", input: "refund policy", output: "same" },
    ]);

    expect(result.exactDuplicates).toBe(1);
  });

  it("finds near duplicates with trigram overlap", () => {
    const result = checkDuplicateDetection([
      { id: "1", input: "refund policy clarification please urgently", output: "same" },
      { id: "2", input: "refund policy clarification please urgent", output: "same" },
    ]);

    expect(result.nearDuplicates).toBe(1);
  });

  it("does not flag unrelated inputs as duplicates", () => {
    const result = checkDuplicateDetection([
      { id: "1", input: "refund policy", output: "same" },
      { id: "2", input: "database migration plan", output: "same" },
    ]);

    expect(result.exactDuplicates).toBe(0);
    expect(result.nearDuplicates).toBe(0);
  });

  it("flags short and long content correctly", () => {
    const result = checkLengthAnalysis([
      { id: "1", input: "short", output: "ok" },
      { id: "2", input: "x".repeat(9000), output: "y".repeat(5001) },
    ]);

    expect(result.tooShort).toBeGreaterThan(0);
    expect(result.tooLong).toBeGreaterThan(0);
  });

  it("detects emails, phones, and ssns", () => {
    const result = checkPiiDetection([
      {
        id: "1",
        input: "Email me at user@example.com or call +1 202-555-0147",
        output: "SSN 123-45-6789",
      },
    ]);

    expect(result.detected).toBe(1);
    expect(result.categories.email).toBe(1);
    expect(result.categories.phone).toBe(1);
    expect(result.categories.ssn).toBe(1);
  });

  it("does not flag clean examples as pii", () => {
    const result = checkPiiDetection([
      {
        id: "1",
        input: "What is the refund policy for annual plans?",
        output: "Refunds are processed in five business days.",
      },
    ]);

    expect(result.detected).toBe(0);
  });

  it("flags empty outputs", () => {
    const result = checkEmptyOutputs([
      { id: "1", input: "Hello", output: "" },
      { id: "2", input: "Hi", output: null },
      { id: "3", input: "Hey", output: "done" },
    ]);

    expect(result.count).toBe(2);
  });

  it("calculates health score for known inputs", () => {
    const score = calculateHealthScore({
      duplicates: {
        exactDuplicates: 4,
        nearDuplicates: 3,
        pairs: [],
      },
      pii: {
        detected: 2,
        categories: { email: 1, phone: 1, ssn: 0, credit_card: 0 },
        flagged: [],
      },
      length: {
        tooShort: 2,
        tooLong: 1,
        flagged: [],
      },
      labelBalance: {
        categories: { yes: 90, no: 10 },
        balanced: false,
        warnings: [],
      },
      emptyOutputs: {
        count: 1,
        flagged: [],
      },
    });

    expect(score).toBe(60);
  });

  it("keeps health score within bounds", () => {
    const score = calculateHealthScore({
      duplicates: {
        exactDuplicates: 999,
        nearDuplicates: 999,
        pairs: [],
      },
      pii: {
        detected: 999,
        categories: { email: 0, phone: 0, ssn: 0, credit_card: 0 },
        flagged: [],
      },
      length: {
        tooShort: 999,
        tooLong: 999,
        flagged: [],
      },
      labelBalance: {
        categories: {},
        balanced: false,
        warnings: [],
      },
      emptyOutputs: {
        count: 999,
        flagged: [],
      },
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("generates a useful recommendation string", () => {
    const recommendation = generateRecommendation({
      duplicates: {
        exactDuplicates: 43,
        nearDuplicates: 0,
        pairs: [],
      },
      pii: {
        detected: 3,
        categories: { email: 0, phone: 0, ssn: 0, credit_card: 0 },
        flagged: [],
      },
      projectedSaving: 1.43,
    });

    expect(recommendation).toContain("43 exact duplicates");
    expect(recommendation).toContain("$1.43");
  });

  it("builds a full dataset report", () => {
    const report = buildDatasetQualityReport([
      { id: "1", input: "refund policy details", output: "refund approved" },
      { id: "2", input: "refund policy details", output: "refund approved" },
      { id: "3", input: "Email me at user@example.com", output: "" },
    ]);

    expect(report.totalExamples).toBe(3);
    expect(report.healthScore).toBeLessThan(100);
    expect(report.piiDetected).toBe(1);
  });
});
