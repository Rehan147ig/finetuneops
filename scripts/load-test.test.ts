import { describe, expect, it } from "vitest";
import { evaluateOverall, evaluateResult } from "./load-test";

describe("load test evaluation", () => {
  it("marks test as passed when rps meets target", () => {
    expect(
      evaluateResult(
        { rps: 250, p99: 400 },
        { rps: 200, p99: 500 },
      ),
    ).toBe(true);
  });

  it("marks test as failed when rps below target", () => {
    expect(
      evaluateResult(
        { rps: 150, p99: 400 },
        { rps: 200, p99: 500 },
      ),
    ).toBe(false);
  });

  it("marks test as failed when p99 exceeds target", () => {
    expect(
      evaluateResult(
        { rps: 250, p99: 600 },
        { rps: 200, p99: 500 },
      ),
    ).toBe(false);
  });

  it("marks test as passed when both metrics met", () => {
    expect(
      evaluateResult(
        { rps: 700, p99: 45 },
        { rps: 500, p99: 50 },
      ),
    ).toBe(true);
  });

  it("overall result fails if any single test fails", () => {
    expect(
      evaluateOverall({
        "Trace ingestion": { passed: true },
        "Trace list read": { passed: false },
        "Health endpoint": { passed: true },
      }),
    ).toBe(false);
  });
});
