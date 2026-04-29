import { sanitizeText } from "@/lib/workflow-rules";

export type TraceIngestPayload = {
  input: string;
  output: string;
  model: string;
  latency_ms: number;
  metadata: Record<string, unknown>;
  tags: string[];
};

export function summarizeTraceTitle(input: string): string {
  const summary = sanitizeText(input).slice(0, 72);
  return summary.length < input.length ? `${summary}...` : summary;
}

export function validateTraceIngestPayload(
  payload: unknown,
): { ok: true; data: TraceIngestPayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      error: "Payload must be a JSON object.",
    };
  }

  const candidate = payload as Record<string, unknown>;
  const input = sanitizeText(String(candidate.input ?? ""));
  const output = sanitizeText(String(candidate.output ?? ""));
  const model = sanitizeText(String(candidate.model ?? ""));
  const latency = candidate.latency_ms;
  const metadata = candidate.metadata;
  const tags = candidate.tags;

  if (input.length < 8) {
    return {
      ok: false,
      error: "input must be at least 8 characters long.",
    };
  }

  if (output.length < 8) {
    return {
      ok: false,
      error: "output must be at least 8 characters long.",
    };
  }

  if (model.length < 3) {
    return {
      ok: false,
      error: "model must be at least 3 characters long.",
    };
  }

  if (!Number.isFinite(latency) || Number(latency) < 0) {
    return {
      ok: false,
      error: "latency_ms must be a non-negative number.",
    };
  }

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {
      ok: false,
      error: "metadata must be a JSON object.",
    };
  }

  if (!Array.isArray(tags)) {
    return {
      ok: false,
      error: "tags must be an array of strings.",
    };
  }

  const normalizedTags = tags
    .map((tag) => sanitizeText(String(tag)))
    .filter(Boolean);

  if (normalizedTags.some((tag) => tag.length > 32)) {
    return {
      ok: false,
      error: "tags must be 32 characters or fewer.",
    };
  }

  return {
    ok: true,
    data: {
      input,
      output,
      model,
      latency_ms: Math.round(Number(latency)),
      metadata: metadata as Record<string, unknown>,
      tags: normalizedTags,
    },
  };
}
