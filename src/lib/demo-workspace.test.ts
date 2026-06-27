import { describe, expect, it } from "vitest";
import { buildDemoWorkspaceSeed } from "../../prisma/demo-workspace.mjs";

describe("buildDemoWorkspaceSeed", () => {
  it("creates a realistic starter workspace with the expected object counts", () => {
    const demo = buildDemoWorkspaceSeed();
    const failedTraces = demo.traceEvents.filter((trace) => trace.tags.includes("failed"));
    const successfulTraces = demo.traceEvents.filter((trace) => trace.tags.includes("successful"));

    expect(demo.traceEvents).toHaveLength(50);
    expect(failedTraces).toHaveLength(20);
    expect(successfulTraces).toHaveLength(30);
    expect(demo.datasets).toHaveLength(3);
    expect(demo.experiments).toHaveLength(2);
    expect(demo.trainingJobs).toHaveLength(2);
    expect(demo.pendingRelease.reviewToken).toBeTruthy();
  });

  it("plants a complete end-to-end regression chain for the demo", () => {
    const demo = buildDemoWorkspaceSeed();
    const { regression } = demo;

    // Baseline (healthy) → candidate (regressed) with a real score drop.
    expect(regression.alert.baselineScore).toBeGreaterThan(regression.alert.candidateScore);
    expect(regression.alert.delta).toBeLessThan(0);
    expect(regression.alert.status).toBe("open");

    // TRA report has a root cause and at least one flagged example.
    expect(regression.traReport.confidence).toBeGreaterThan(0.8);
    expect(regression.traReport.suspiciousExamples.length).toBeGreaterThanOrEqual(3);
    expect(regression.traReport.suspiciousExamples.every((ex) => ex.confidence > 0.6)).toBe(true);

    // The planted categories must cover the TRA techniques the demo needs to show.
    const categories = regression.traReport.suspiciousExamples.map((ex) => ex.category);
    expect(categories).toEqual(expect.arrayContaining([
      "duplicate_conflict",
      "instruction_conflict",
      "label_noise",
    ]));
  });

  it("contains the required dataset quality states for onboarding", () => {
    const demo = buildDemoWorkspaceSeed();
    const statuses = demo.datasets.map((dataset) => dataset.status);

    expect(statuses).toContain("needs_review");
    expect(statuses).toContain("ready");
    expect(statuses).toContain("processing");
  });
});
