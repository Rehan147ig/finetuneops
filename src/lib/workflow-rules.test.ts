import { describe, expect, it } from "vitest";
import {
  canPromoteTrace,
  canCreateExperimentFromDataset,
  canLaunchFineTuneFromExperiment,
  datasetNameFromTraceTitle,
  canAdvanceRelease,
  nextDatasetVersion,
  nextPromptVersion,
  trainingJobNameFromExperiment,
  traceOpportunityFromSeverity,
  validateTraceInput,
} from "./workflow-rules";

describe("validateTraceInput", () => {
  it("accepts a valid trace payload", () => {
    const result = validateTraceInput({
      title: "Escalation loop after refund denial",
      source: "Support copilot trace",
      severity: "high",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.severity).toBe("high");
      expect(result.data.title).toBe("Escalation loop after refund denial");
    }
  });

  it("rejects very short titles", () => {
    const result = validateTraceInput({
      title: "short",
      source: "Support",
      severity: "medium",
    });

    expect(result.ok).toBe(false);
  });
});

describe("traceOpportunityFromSeverity", () => {
  it("assigns higher opportunity to high severity traces", () => {
    expect(traceOpportunityFromSeverity("high")).toBeGreaterThan(
      traceOpportunityFromSeverity("medium"),
    );
  });
});

describe("canAdvanceRelease", () => {
  it("approves a gated release when quality passes", () => {
    const result = canAdvanceRelease({
      status: "gated",
      qualityGate: "Pass",
      latencyGate: "Pass",
      costGate: "Watch",
    });

    expect(result).toEqual({
      allowed: true,
      nextStatus: "approved",
    });
  });

  it("blocks live promotion when latency is still watch", () => {
    const result = canAdvanceRelease({
      status: "approved",
      qualityGate: "Pass",
      latencyGate: "Watch",
      costGate: "Pass",
    });

    expect(result.allowed).toBe(false);
  });
});

describe("canPromoteTrace", () => {
  it("allows a strong triaged trace to be promoted", () => {
    const result = canPromoteTrace({
      status: "triaged",
      opportunity: 82,
      convertedDatasetId: null,
    });

    expect(result).toEqual({ allowed: true });
  });

  it("blocks a trace that already has a dataset", () => {
    const result = canPromoteTrace({
      status: "triaged",
      opportunity: 82,
      convertedDatasetId: "ds_123",
    });

    expect(result.allowed).toBe(false);
  });
});

describe("dataset helpers", () => {
  it("increments dataset versions safely", () => {
    expect(nextDatasetVersion(["v1", "v2", "foo"])).toBe("v3");
  });

  it("derives a compact dataset name from a trace title", () => {
    expect(
      datasetNameFromTraceTitle("Escalation loop after refund denial"),
    ).toBe("Escalation loop");
  });

  it("increments prompt versions safely", () => {
    expect(nextPromptVersion(["support-v1.8", "support-v1.9"])).toBe(
      "support-v1.10",
    );
  });
});

describe("canCreateExperimentFromDataset", () => {
  it("allows experiments from a ready strong-quality dataset", () => {
    const result = canCreateExperimentFromDataset({
      datasetStatus: "ready",
      quality: 88,
    });

    expect(result).toEqual({ allowed: true });
  });

  it("blocks experiments from low-quality datasets", () => {
    const result = canCreateExperimentFromDataset({
      datasetStatus: "ready",
      quality: 60,
    });

    expect(result.allowed).toBe(false);
  });
});

describe("canLaunchFineTuneFromExperiment", () => {
  it("allows a reviewed high-scoring experiment to launch a fine-tune", () => {
    const result = canLaunchFineTuneFromExperiment({
      status: "Review",
      score: 84,
    });

    expect(result).toEqual({ allowed: true });
  });

  it("blocks low-scoring experiments from fine-tune launch", () => {
    const result = canLaunchFineTuneFromExperiment({
      status: "Promote",
      score: 72,
    });

    expect(result.allowed).toBe(false);
  });
});

describe("trainingJobNameFromExperiment", () => {
  it("derives a stable job name", () => {
    expect(trainingJobNameFromExperiment("Refund rescue prompt pack")).toBe(
      "Refund rescue prompt pack fine-tune",
    );
  });
});
