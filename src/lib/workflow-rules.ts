export type TraceSeverity = "low" | "medium" | "high";
export type ReleaseLifecycle = "gated" | "approved" | "live";

export type ValidTraceInput = {
  title: string;
  source: string;
  severity: TraceSeverity;
};

export function normalizeSeverity(value: string): TraceSeverity {
  if (value === "high" || value === "low") {
    return value;
  }

  return "medium";
}

export function sanitizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function validateTraceInput(input: {
  title?: string;
  source?: string;
  severity?: string;
}): { ok: true; data: ValidTraceInput } | { ok: false; error: string } {
  const title = sanitizeText(input.title ?? "");
  const source = sanitizeText(input.source ?? "");
  const severity = normalizeSeverity(input.severity ?? "medium");

  if (title.length < 8) {
    return {
      ok: false,
      error: "Title must be at least 8 characters long.",
    };
  }

  if (title.length > 120) {
    return {
      ok: false,
      error: "Title must be 120 characters or fewer.",
    };
  }

  if (source.length < 3) {
    return {
      ok: false,
      error: "Source must be at least 3 characters long.",
    };
  }

  if (source.length > 80) {
    return {
      ok: false,
      error: "Source must be 80 characters or fewer.",
    };
  }

  return {
    ok: true,
    data: {
      title,
      source,
      severity,
    },
  };
}

export function traceOpportunityFromSeverity(severity: TraceSeverity): number {
  switch (severity) {
    case "high":
      return 91.5;
    case "low":
      return 62.4;
    default:
      return 78.2;
  }
}

export function canPromoteTrace(input: {
  status: string;
  opportunity: number;
  convertedDatasetId?: string | null;
}): { allowed: true } | { allowed: false; error: string } {
  if (input.convertedDatasetId) {
    return {
      allowed: false,
      error: "Trace is already linked to a dataset.",
    };
  }

  if (input.status === "needs_labeling") {
    return {
      allowed: false,
      error: "Trace still needs labeling before promotion.",
    };
  }

  if (input.opportunity < 70) {
    return {
      allowed: false,
      error: "Trace opportunity is too low for dataset promotion.",
    };
  }

  return { allowed: true };
}

export function nextDatasetVersion(existingVersions: string[]): string {
  const maxVersion = existingVersions.reduce((max, value) => {
    const match = /^v(\d+)$/i.exec(value.trim());
    if (!match) {
      return max;
    }

    return Math.max(max, Number(match[1]));
  }, 0);

  return `v${maxVersion + 1}`;
}

export function datasetNameFromTraceTitle(title: string): string {
  return sanitizeText(title)
    .replace(/\b(after|before|during|when|while)\b.*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function canCreateExperimentFromDataset(input: {
  datasetStatus: string;
  quality: number;
}): { allowed: true } | { allowed: false; error: string } {
  if (input.datasetStatus !== "ready") {
    return {
      allowed: false,
      error: "Dataset must be ready before experiments can start.",
    };
  }

  if (input.quality < 75) {
    return {
      allowed: false,
      error: "Dataset quality is too low to justify a new experiment.",
    };
  }

  return { allowed: true };
}

export function nextPromptVersion(existingVersions: string[]): string {
  const maxVersion = existingVersions.reduce((max, value) => {
    const match = /^([a-z-]+-v)(\d+)\.(\d+)$/i.exec(value.trim());
    if (!match) {
      return max;
    }

    const major = Number(match[2]);
    const minor = Number(match[3]);
    return Math.max(max, major * 100 + minor);
  }, 0);

  const next = maxVersion + 1;
  const major = Math.floor(next / 100) || 1;
  const minor = next % 100;

  return `support-v${major}.${minor}`;
}

export function canLaunchFineTuneFromExperiment(input: {
  status: string;
  score: number;
}): { allowed: true } | { allowed: false; error: string } {
  if (input.status === "Running") {
    return {
      allowed: false,
      error: "Experiment is still running.",
    };
  }

  if (input.score < 80) {
    return {
      allowed: false,
      error: "Experiment score is too low to justify a fine-tune.",
    };
  }

  return { allowed: true };
}

export function trainingJobNameFromExperiment(name: string): string {
  return `${sanitizeText(name)} fine-tune`;
}

function isReleaseLifecycle(value: string): value is ReleaseLifecycle {
  return value === "gated" || value === "approved" || value === "live";
}

export function canAdvanceRelease(input: {
  status: string;
  qualityGate: string;
  latencyGate: string;
  costGate: string;
}): { allowed: true; nextStatus: ReleaseLifecycle } | { allowed: false; error: string } {
  if (!isReleaseLifecycle(input.status)) {
    return {
      allowed: false,
      error: "Unknown release status.",
    };
  }

  if (input.status === "live") {
    return {
      allowed: false,
      error: "Release is already live.",
    };
  }

  if (input.qualityGate !== "Pass") {
    return {
      allowed: false,
      error: "Quality gate must pass before promotion.",
    };
  }

  if (input.status === "approved" && input.latencyGate === "Watch") {
    return {
      allowed: false,
      error: "Latency gate is still under review.",
    };
  }

  return {
    allowed: true,
    nextStatus: input.status === "gated" ? "approved" : "live",
  };
}
