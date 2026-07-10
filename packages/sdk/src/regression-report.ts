export type EvalCase = {
  id?: string;
  input?: string;
  expected?: string;
  output?: string;
  score?: number;
  passed?: boolean;
  metric?: string;
  model?: string;
  promptVersion?: string;
  retrievalVersion?: string;
  latency_ms?: number;
  cost_usd?: number;
  metadata?: Record<string, unknown>;
};

export type TrainingExample = {
  id?: string;
  input?: string;
  output?: string;
  label?: string;
  messages?: Array<{ role?: string; content?: string }>;
  metadata?: Record<string, unknown>;
};

export type RegressionReportInput = {
  baseline: EvalCase[];
  candidate: EvalCase[];
  trainingData?: TrainingExample[];
  minDrop?: number;
};

export type FailedCaseFinding = {
  id: string;
  inputPreview: string;
  baselineScore: number;
  candidateScore: number;
  drop: number;
  metric: string;
};

export type DatasetFinding = {
  type: "duplicate_conflict" | "pii_leak" | "long_example";
  severity: "LOW" | "MEDIUM" | "HIGH";
  exampleIds: string[];
  reason: string;
};

export type ChangeFinding = {
  field: string;
  baselineValue: string;
  candidateValue: string;
  affectedCases: number;
  reason: string;
};

export type RegressionReport = {
  schemaVersion: "2026-07-llm-regression-report";
  summary: {
    baselineScore: number;
    candidateScore: number;
    drop: number;
    regressed: boolean;
    impactRating: "LOW" | "MEDIUM" | "HIGH";
    comparedCases: number;
    unmatchedBaselineCases: number;
    unmatchedCandidateCases: number;
  };
  failedCases: FailedCaseFinding[];
  datasetFindings: DatasetFinding[];
  changeFindings: ChangeFinding[];
  recommendation: string;
};

const DEFAULT_MIN_DROP = 0.05;
const PII_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\+?\d[\d\s().-]{7,}\d)\b/i;

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function preview(value: unknown, maxLength = 180): string {
  const text = stringifyValue(value).replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function caseId(item: EvalCase, index: number): string {
  return item.id || preview(item.input, 64) || `case-${index + 1}`;
}

function scoreOf(item: EvalCase): number {
  if (typeof item.score === "number" && Number.isFinite(item.score)) {
    return Math.max(0, Math.min(1, item.score));
  }

  if (typeof item.passed === "boolean") {
    return item.passed ? 1 : 0;
  }

  return 0;
}

function averageScore(items: EvalCase[]): number {
  if (items.length === 0) return 0;
  const total = items.reduce((sum, item) => sum + scoreOf(item), 0);
  return Number((total / items.length).toFixed(4));
}

type MatchedCase = {
  id: string;
  baseline: EvalCase;
  candidate: EvalCase;
};

function matchEvalCases(baseline: EvalCase[], candidate: EvalCase[]) {
  const candidateById = new Map(candidate.map((item, index) => [caseId(item, index), { item, index }]));
  const matchedCandidateIndexes = new Set<number>();
  const pairs: MatchedCase[] = [];
  let unmatchedBaselineCases = 0;

  baseline.forEach((base, index) => {
    const id = caseId(base, index);
    const match = candidateById.get(id);
    const next = match ?? (!base.id ? { item: candidate[index], index } : undefined);

    if (!next?.item) {
      unmatchedBaselineCases += 1;
      return;
    }

    matchedCandidateIndexes.add(next.index);
    pairs.push({ id, baseline: base, candidate: next.item });
  });

  return {
    pairs,
    unmatchedBaselineCases,
    unmatchedCandidateCases: candidate.filter((_, index) => !matchedCandidateIndexes.has(index)).length,
  };
}

function normalizedTrainingText(example: TrainingExample): string {
  if (example.input) return example.input.trim().toLowerCase();

  const userMessage = example.messages?.find((message) => message.role === "user");
  return stringifyValue(userMessage?.content).trim().toLowerCase();
}

function trainingOutput(example: TrainingExample): string {
  if (example.output) return example.output;
  if (example.label) return example.label;

  const assistantMessage = example.messages?.find((message) => message.role === "assistant");
  return stringifyValue(assistantMessage?.content);
}

function trainingId(example: TrainingExample, index: number): string {
  return example.id || `training-${index + 1}`;
}

function detectDatasetFindings(trainingData: TrainingExample[] = []): DatasetFinding[] {
  const findings: DatasetFinding[] = [];
  const byInput = new Map<string, Array<{ example: TrainingExample; index: number }>>();

  trainingData.forEach((example, index) => {
    const input = normalizedTrainingText(example);
    if (!input) return;

    const group = byInput.get(input) ?? [];
    group.push({ example, index });
    byInput.set(input, group);

    const fullText = `${stringifyValue(example.input)} ${trainingOutput(example)} ${stringifyValue(example.messages)}`;
    if (PII_PATTERN.test(fullText)) {
      findings.push({
        type: "pii_leak",
        severity: "HIGH",
        exampleIds: [trainingId(example, index)],
        reason: "Training example appears to contain an email address or phone number.",
      });
    }

    if (fullText.length > 8000) {
      findings.push({
        type: "long_example",
        severity: "MEDIUM",
        exampleIds: [trainingId(example, index)],
        reason: "Training example is unusually long and may dominate context or cost.",
      });
    }
  });

  for (const group of byInput.values()) {
    if (group.length < 2) continue;

    const outputs = new Set(group.map(({ example }) => trainingOutput(example).trim().toLowerCase()));
    if (outputs.size <= 1) continue;

    findings.push({
      type: "duplicate_conflict",
      severity: "HIGH",
      exampleIds: group.map(({ example, index }) => trainingId(example, index)),
      reason: "Near-identical training inputs have conflicting outputs or labels.",
    });
  }

  return findings;
}

function detectChangeFindings(pairs: MatchedCase[]): ChangeFinding[] {
  const fields: Array<keyof EvalCase> = ["model", "promptVersion", "retrievalVersion"];
  const findings: ChangeFinding[] = [];

  fields.forEach((field) => {
    const changed = pairs.filter(({ baseline, candidate: next }) => {
      return stringifyValue(baseline[field]) !== stringifyValue(next[field]);
    });

    if (changed.length === 0) return;

    const first = changed[0];
    findings.push({
      field,
      baselineValue: stringifyValue(first.baseline[field]) || "unset",
      candidateValue: stringifyValue(first.candidate[field]) || "unset",
      affectedCases: changed.length,
      reason: `${field} changed across ${changed.length} eval case(s), so this release should be reviewed as a possible regression source.`,
    });
  });

  return findings;
}

function impactRating(drop: number, failedCases: number, highRiskDatasetFindings: number): "LOW" | "MEDIUM" | "HIGH" {
  if (drop >= 0.15 || failedCases >= 10 || highRiskDatasetFindings > 0) return "HIGH";
  if (drop >= 0.05 || failedCases >= 3) return "MEDIUM";
  return "LOW";
}

function buildRecommendation(report: Omit<RegressionReport, "recommendation">): string {
  if (report.summary.comparedCases === 0) {
    return "No matching eval cases were found. Set finetuneops_case_id in release metadata before comparing releases.";
  }

  if (!report.summary.regressed) {
    return "No material regression detected. Keep the report as release evidence.";
  }

  if (report.datasetFindings.some((finding) => finding.type === "duplicate_conflict")) {
    return "Review duplicate-conflict training rows first, then rerun the eval before release.";
  }

  if (report.datasetFindings.some((finding) => finding.type === "pii_leak")) {
    return "Remove or redact PII-bearing training rows before release approval.";
  }

  if (report.changeFindings.length > 0) {
    return "Review the changed model, prompt, or retrieval version against the highest-drop eval cases.";
  }

  return "Review the failed eval cases and add targeted regression tests before promoting this release.";
}

export function analyzeRegressionReport(input: RegressionReportInput): RegressionReport {
  const minDrop = input.minDrop ?? DEFAULT_MIN_DROP;
  const matching = matchEvalCases(input.baseline, input.candidate);
  const baselineScore = averageScore(matching.pairs.map((pair) => pair.baseline));
  const candidateScore = averageScore(matching.pairs.map((pair) => pair.candidate));
  const drop = Number((baselineScore - candidateScore).toFixed(4));

  const failedCases = matching.pairs
    .map(({ id, baseline: base, candidate: next }): FailedCaseFinding | null => {

      const baselineCaseScore = scoreOf(base);
      const candidateCaseScore = scoreOf(next);
      const caseDrop = Number((baselineCaseScore - candidateCaseScore).toFixed(4));

      if (caseDrop < minDrop) return null;

      return {
        id,
        inputPreview: preview(base.input ?? next.input),
        baselineScore: baselineCaseScore,
        candidateScore: candidateCaseScore,
        drop: caseDrop,
        metric: next.metric || base.metric || "quality",
      };
    })
    .filter((item): item is FailedCaseFinding => item !== null)
    .sort((a, b) => b.drop - a.drop);

  const datasetFindings = detectDatasetFindings(input.trainingData);
  const changeFindings = detectChangeFindings(matching.pairs);
  const highRiskDatasetFindings = datasetFindings.filter((finding) => finding.severity === "HIGH").length;

  const reportWithoutRecommendation = {
    schemaVersion: "2026-07-llm-regression-report" as const,
    summary: {
      baselineScore,
      candidateScore,
      drop,
      regressed: matching.pairs.length > 0 && drop >= minDrop,
      impactRating: impactRating(drop, failedCases.length, highRiskDatasetFindings),
      comparedCases: matching.pairs.length,
      unmatchedBaselineCases: matching.unmatchedBaselineCases,
      unmatchedCandidateCases: matching.unmatchedCandidateCases,
    },
    failedCases,
    datasetFindings,
    changeFindings,
  };

  return {
    ...reportWithoutRecommendation,
    recommendation: buildRecommendation(reportWithoutRecommendation),
  };
}

export function renderRegressionReportMarkdown(report: RegressionReport): string {
  const lines = [
    "# FineTuneOps LLM Regression Report",
    "",
    `- Baseline score: ${report.summary.baselineScore}`,
    `- Candidate score: ${report.summary.candidateScore}`,
    `- Drop: ${report.summary.drop}`,
    `- Regressed: ${report.summary.regressed ? "yes" : "no"}`,
    `- Impact: ${report.summary.impactRating}`,
    `- Matched eval cases: ${report.summary.comparedCases}`,
    `- Unmatched baseline cases: ${report.summary.unmatchedBaselineCases}`,
    `- Unmatched candidate cases: ${report.summary.unmatchedCandidateCases}`,
    "",
    `Recommendation: ${report.recommendation}`,
    "",
    "## Failed Eval Cases",
  ];

  if (report.failedCases.length === 0) {
    lines.push("", "No per-case drops crossed the threshold.");
  } else {
    report.failedCases.forEach((item) => {
      lines.push(
        "",
        `- ${item.id}: ${item.baselineScore} -> ${item.candidateScore} (${item.drop} drop)`,
        `  - Metric: ${item.metric}`,
        `  - Input: ${item.inputPreview}`,
      );
    });
  }

  lines.push("", "## Dataset Findings");
  if (report.datasetFindings.length === 0) {
    lines.push("", "No training-data findings were detected.");
  } else {
    report.datasetFindings.forEach((item) => {
      lines.push("", `- ${item.severity} ${item.type}: ${item.reason}`, `  - Examples: ${item.exampleIds.join(", ")}`);
    });
  }

  lines.push("", "## Release Change Findings");
  if (report.changeFindings.length === 0) {
    lines.push("", "No model, prompt, or retrieval version changes were detected in the eval rows.");
  } else {
    report.changeFindings.forEach((item) => {
      lines.push("", `- ${item.field}: ${item.baselineValue} -> ${item.candidateValue}`, `  - ${item.reason}`);
    });
  }

  return `${lines.join("\n")}\n`;
}
