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
    expect(demo.trainingJobs).toHaveLength(1);
    expect(demo.pendingRelease.reviewToken).toBeTruthy();
  });

  it("contains the required dataset quality states for onboarding", () => {
    const demo = buildDemoWorkspaceSeed();
    const statuses = demo.datasets.map((dataset) => dataset.status);

    expect(statuses).toContain("needs_review");
    expect(statuses).toContain("ready");
    expect(statuses).toContain("processing");
  });
});
