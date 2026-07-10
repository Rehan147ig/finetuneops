import type { EvalCase } from "./regression-report";

export type LangSmithRun = {
  id?: string;
  name?: string;
  run_type?: string;
  inputs?: unknown;
  outputs?: unknown;
  error?: string | null;
  latency?: number;
  start_time?: string;
  end_time?: string;
  extra?: {
    metadata?: Record<string, unknown>;
    invocation_params?: Record<string, unknown>;
  };
  feedback_stats?: Record<string, unknown>;
  tags?: string[];
};

export type LangSmithImportOptions = {
  scoreKey?: string;
  includeRunTypes?: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return undefined;
  return JSON.stringify(value);
}

function firstText(value: unknown): string | undefined {
  if (typeof value === "string") return value;

  const record = asRecord(value);
  for (const key of ["input", "question", "query", "text", "content", "output", "answer", "response"]) {
    const candidate = textValue(record[key]);
    if (candidate) return candidate;
  }

  return textValue(value);
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return undefined;
}

function scoreFromFeedback(run: LangSmithRun, scoreKey?: string): number | undefined {
  const feedback = run.feedback_stats ?? {};
  if (scoreKey) {
    const direct = numericValue(feedback[scoreKey]);
    if (direct !== undefined) return direct;
    const nested = numericValue(asRecord(feedback[scoreKey]).score);
    if (nested !== undefined) return nested;
  }

  for (const value of Object.values(feedback)) {
    const direct = numericValue(value);
    if (direct !== undefined) return direct;

    const record = asRecord(value);
    for (const key of ["avg", "mean", "score", "value"]) {
      const nested = numericValue(record[key]);
      if (nested !== undefined) return nested;
    }
  }

  return run.error ? 0 : undefined;
}

function latencyMs(run: LangSmithRun): number | undefined {
  if (typeof run.latency === "number" && Number.isFinite(run.latency)) {
    return Math.round(run.latency * 1000);
  }

  if (!run.start_time || !run.end_time) return undefined;
  const start = Date.parse(run.start_time);
  const end = Date.parse(run.end_time);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : undefined;
}

function tagValue(tags: string[] | undefined, prefix: string): string | undefined {
  return tags?.find((tag) => tag.startsWith(prefix))?.slice(prefix.length);
}

export function importLangSmithRuns(runs: LangSmithRun[], options: LangSmithImportOptions = {}): EvalCase[] {
  const includeRunTypes = new Set(options.includeRunTypes ?? ["llm", "chain"]);

  return runs
    .filter((run) => !run.run_type || includeRunTypes.has(run.run_type))
    .map((run, index): EvalCase => {
      const metadata = run.extra?.metadata ?? {};
      const invocation = run.extra?.invocation_params ?? {};
      const score = scoreFromFeedback(run, options.scoreKey);

      return {
        id: run.id ?? `langsmith-run-${index + 1}`,
        input: firstText(run.inputs),
        output: firstText(run.outputs),
        score,
        passed: score === undefined ? (run.error ? false : undefined) : score > 0,
        metric: options.scoreKey ?? "langsmith_feedback",
        model: textValue(invocation.model ?? metadata.model ?? tagValue(run.tags, "model:")),
        promptVersion: textValue(metadata.promptVersion ?? metadata.prompt_version ?? tagValue(run.tags, "prompt:")),
        retrievalVersion: textValue(metadata.retrievalVersion ?? metadata.retrieval_version ?? tagValue(run.tags, "retrieval:")),
        latency_ms: latencyMs(run),
        metadata: {
          ...metadata,
          langsmithRunType: run.run_type,
          langsmithRunName: run.name,
          langsmithTags: run.tags,
          langsmithError: run.error ?? undefined,
        },
      };
    });
}
