import OpenAI from "openai";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Fine-tune provider abstraction
//
// The launch-finetune and poll-finetune workers route through this interface so
// the platform can fine-tune on OpenAI, Fireworks AI, or Together AI without
// the worker code branching on provider. Each provider adapter implements two
// operations:
//   - launchFineTune: upload the JSONL, submit the job, return the provider id
//   - pollFineTune:   fetch the job status, map to our normalized shape
//
// RULE 2 applies: adapters only ever receive the customer's decrypted API key,
// never a platform-owned key.
// ---------------------------------------------------------------------------

export type FineTuneProviderName = "openai" | "fireworks" | "together";

export type NormalizedJobStatus = "running" | "succeeded" | "failed";

export type LaunchResult = {
  providerJobId: string;
  trainingFileId?: string;
  initialStatus: string;
};

export type PollResult = {
  status: NormalizedJobStatus;
  fineTunedModelId?: string | null;
  trainedTokens?: number | null;
  validationLoss?: number | null;
  rawStatus: string;
  errorMessage?: string | null;
};

export type LaunchInput = {
  apiKey: string;
  jsonlContent: string;
  modelBase: string;
  datasetName: string;
};

export type PollInput = {
  apiKey: string;
  providerJobId: string;
  modelBase: string;
};

export interface FineTuneProvider {
  name: FineTuneProviderName;
  launchFineTune(input: LaunchInput): Promise<LaunchResult>;
  pollFineTune(input: PollInput): Promise<PollResult>;
}

function asJsonlFile(jsonlContent: string) {
  return new File([jsonlContent], "training.jsonl", {
    type: "application/jsonl",
  });
}

// ----------------------------- OpenAI -------------------------------------
// Thin wrapper over the official SDK. This is the reference adapter and the
// only one that uses a first-party client; Fireworks and Together use REST.

class OpenAIFineTuneProvider implements FineTuneProvider {
  name = "openai" as const;

  private client(apiKey: string) {
    return new OpenAI({ apiKey, timeout: 10_000 });
  }

  async launchFineTune(input: LaunchInput): Promise<LaunchResult> {
    const openai = this.client(input.apiKey);
    const uploadedFile = await openai.files.create({
      file: asJsonlFile(input.jsonlContent),
      purpose: "fine-tune",
    });
    const fineTuneJob = await openai.fineTuning.jobs.create({
      training_file: uploadedFile.id,
      model: input.modelBase || "gpt-4o-mini",
    });
    return {
      providerJobId: fineTuneJob.id,
      trainingFileId: uploadedFile.id,
      initialStatus: fineTuneJob.status,
    };
  }

  async pollFineTune(input: PollInput): Promise<PollResult> {
    const openai = this.client(input.apiKey);
    const fineTuneJob = await openai.fineTuning.jobs.retrieve(input.providerJobId);

    const running = ["validating_files", "queued", "running"].includes(fineTuneJob.status);
    if (running) {
      return { status: "running", rawStatus: fineTuneJob.status };
    }

    if (fineTuneJob.status === "succeeded") {
      return {
        status: "succeeded",
        fineTunedModelId: fineTuneJob.fine_tuned_model ?? null,
        trainedTokens: fineTuneJob.trained_tokens ?? null,
        validationLoss: extractValidationLoss(fineTuneJob.result_files),
        rawStatus: fineTuneJob.status,
      };
    }

    return {
      status: "failed",
      rawStatus: fineTuneJob.status,
      errorMessage: `OpenAI fine-tune ${fineTuneJob.status}`,
    };
  }
}

// ----------------------------- REST helpers --------------------------------

const MAX_RETRIES = 2; // 1 initial attempt + 2 retries = 3 total attempts
const INITIAL_BACKOFF_MS = 1_000;

function isRetriableStatus(status: number) {
  // 429 = rate limited, 5xx = transient server error. 4xx (auth/validation/
  // not-found) are never retried — they will not succeed on a second attempt.
  return status === 429 || status >= 500;
}

function isRetriableError(error: unknown) {
  // Network failures, DNS errors, and aborts (timeouts) are transient and worth
  // one more attempt. Any non-Error (shouldn't happen) is treated as retriable
  // to be safe, since the cost of one extra attempt is low.
  if (error instanceof Error) {
    const name = error.name;
    return (
      name === "AbortError" || // timeout
      name === "TypeError" || // fetch network failure in Node/undici
      name === "FetchError" // undici fetch error
    );
  }
  return true;
}

function backoffMs(response: Response | null, attempt: number) {
  // Respect the server's Retry-After header when present (seconds), otherwise
  // exponential backoff with full jitter to avoid thundering-herd on 429s.
  if (response) {
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }
  }
  const base = INITIAL_BACKOFF_MS * 2 ** attempt;
  return Math.min(base + Math.random() * INITIAL_BACKOFF_MS, 15_000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function restFetch(
  url: string,
  apiKey: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          ...(init.headers ?? {}),
        },
      });
      lastResponse = response;

      if (!isRetriableStatus(response.status)) {
        return response;
      }

      // Retriable HTTP status — back off and retry if attempts remain.
      if (attempt < MAX_RETRIES) {
        logger.warn({
          event: "provider_fetch_retry_http",
          url,
          status: response.status,
          attempt: attempt + 1,
        });
        await sleep(backoffMs(response, attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES && isRetriableError(error)) {
        logger.warn({
          event: "provider_fetch_retry_network",
          url,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : "unknown",
        });
        await sleep(backoffMs(null, attempt));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Exhausted retries on a retriable HTTP status — return the last response so
  // the caller can surface the provider's error message.
  if (lastResponse) {
    return lastResponse;
  }
  throw lastError ?? new Error(`restFetch failed with no response from ${url}`);
}

function extractValidationLoss(resultFiles: unknown): number | null {
  if (!Array.isArray(resultFiles)) {
    return null;
  }

  for (const resultFile of resultFiles) {
    if (!resultFile || typeof resultFile !== "object") {
      continue;
    }

    const fileRecord = resultFile as {
      validation_loss?: unknown;
      metrics?: { validation_loss?: unknown };
    };

    if (typeof fileRecord.validation_loss === "number") {
      return fileRecord.validation_loss;
    }

    if (typeof fileRecord.metrics?.validation_loss === "number") {
      return fileRecord.metrics.validation_loss;
    }
  }

  return null;
}

// ----------------------------- Fireworks AI --------------------------------
// REST: https://docs.fireworks.ai/fine-tuning. Fireworks accepts a JSONL
// dataset object and a model; the job status lifecycle maps to ours.

class FireworksFineTuneProvider implements FineTuneProvider {
  name = "fireworks" as const;
  private base = "https://api.fireworks.ai/v1";

  async launchFineTune(input: LaunchInput): Promise<LaunchResult> {
    const datasetRes = await restFetch(`${this.base}/datasets`, input.apiKey, {
      method: "POST",
      body: JSON.stringify({ display_name: input.datasetName }),
    });
    if (!datasetRes.ok) {
      throw new Error(`Fireworks dataset create failed: ${datasetRes.status}`);
    }
    const dataset = (await datasetRes.json()) as { id: string };
    if (!dataset.id) {
      throw new Error("Fireworks dataset create returned no id");
    }
    // JSONL upload must use text/plain, not application/json
    const uploadRes = await restFetch(`${this.base}/datasets/${dataset.id}/upload`, input.apiKey, {
      method: "POST",
      body: input.jsonlContent,
      headers: { "content-type": "text/plain" },
    });
    if (!uploadRes.ok) {
      throw new Error(`Fireworks dataset upload failed: ${uploadRes.status}`);
    }

    const jobRes = await restFetch(`${this.base}/fine_tuning_jobs`, input.apiKey, {
      method: "POST",
      body: JSON.stringify({
        dataset_id: dataset.id,
        model: input.modelBase,
        display_name: input.datasetName,
      }),
    });
    if (!jobRes.ok) {
      throw new Error(`Fireworks job create failed: ${jobRes.status}`);
    }
    const job = (await jobRes.json()) as { id: string; status: string };

    return {
      providerJobId: job.id,
      trainingFileId: dataset.id,
      initialStatus: job.status,
    };
  }

  async pollFineTune(input: PollInput): Promise<PollResult> {
    const res = await restFetch(
      `${this.base}/fine_tuning_jobs/${input.providerJobId}`,
      input.apiKey,
    );
    if (!res.ok) {
      throw new Error(`Fireworks poll failed: ${res.status}`);
    }
    const job = (await res.json()) as {
      status: string;
      model_id?: string;
      trained_token_count?: number;
      eval_loss?: number;
    };

    const status = String(job.status || "").toLowerCase();
    if (["queued", "running", "starting"].includes(status)) {
      return { status: "running", rawStatus: job.status };
    }
    if (status === "success" || status === "succeeded") {
      return {
        status: "succeeded",
        fineTunedModelId: job.model_id ?? null,
        trainedTokens: job.trained_token_count ?? null,
        validationLoss: typeof job.eval_loss === "number" ? job.eval_loss : null,
        rawStatus: job.status,
      };
    }
    return {
      status: "failed",
      rawStatus: job.status,
      errorMessage: `Fireworks fine-tune ${job.status}`,
    };
  }
}

// ----------------------------- Together AI ---------------------------------
// REST: https://docs.together.ai/docs/fine-tuning. Together accepts a direct
// JSONL upload on job create and exposes a simple status endpoint.

class TogetherFineTuneProvider implements FineTuneProvider {
  name = "together" as const;
  private base = "https://api.together.xyz/v1";

  async launchFineTune(input: LaunchInput): Promise<LaunchResult> {
    // Together requires a file upload step first (mirrors OpenAI's files API)
    const formData = new FormData();
    formData.append("file", new Blob([input.jsonlContent], { type: "text/plain" }), "training.jsonl");
    formData.append("purpose", "fine-tune");

    const uploadController = new AbortController();
    const uploadTimeout = setTimeout(() => uploadController.abort(), 60_000);
    let fileRes: Response;
    try {
      fileRes = await fetch(`${this.base}/files`, {
        method: "POST",
        signal: uploadController.signal,
        headers: { authorization: `Bearer ${input.apiKey}` },
        body: formData,
      });
    } finally {
      clearTimeout(uploadTimeout);
    }
    if (!fileRes.ok) {
      throw new Error(`Together file upload failed: ${fileRes.status}`);
    }
    const uploadedFile = (await fileRes.json()) as { id: string };
    if (!uploadedFile.id) {
      throw new Error("Together file upload returned no id");
    }

    const jobRes = await restFetch(`${this.base}/fine-tunes`, input.apiKey, {
      method: "POST",
      body: JSON.stringify({
        training_file: uploadedFile.id,
        model: input.modelBase,
      }),
    });
    if (!jobRes.ok) {
      throw new Error(`Together job create failed: ${jobRes.status}`);
    }
    const job = (await jobRes.json()) as { id: string; status: string };

    return {
      providerJobId: job.id,
      trainingFileId: uploadedFile.id,
      initialStatus: job.status,
    };
  }

  async pollFineTune(input: PollInput): Promise<PollResult> {
    const res = await restFetch(`${this.base}/fine-tunes/${input.providerJobId}`, input.apiKey);
    if (!res.ok) {
      throw new Error(`Together poll failed: ${res.status}`);
    }
    const job = (await res.json()) as {
      status: string;
      model_output_name?: string;
      output_name?: string;
      token_count?: number;
      eval_loss?: number;
    };

    const status = String(job.status || "").toLowerCase();
    if (["pending", "queued", "running"].includes(status)) {
      return { status: "running", rawStatus: job.status };
    }
    if (status === "completed" || status === "succeeded") {
      return {
        status: "succeeded",
        fineTunedModelId: job.model_output_name ?? job.output_name ?? null,
        trainedTokens: job.token_count ?? null,
        validationLoss: typeof job.eval_loss === "number" ? job.eval_loss : null,
        rawStatus: job.status,
      };
    }
    return {
      status: "failed",
      rawStatus: job.status,
      errorMessage: `Together fine-tune ${job.status}`,
    };
  }
}

// ----------------------------- Registry ------------------------------------

const providers: Record<FineTuneProviderName, FineTuneProvider> = {
  openai: new OpenAIFineTuneProvider(),
  fireworks: new FireworksFineTuneProvider(),
  together: new TogetherFineTuneProvider(),
};

export function getFineTuneProvider(name: string): FineTuneProvider {
  const normalized = String(name || "").toLowerCase() as FineTuneProviderName;
  const provider = providers[normalized];

  if (!provider) {
    throw new Error(`Unsupported fine-tune provider: ${name}`);
  }

  return provider;
}

// Maps a training job's provider string to the credential provider key used by
// getActiveCredential(). The credential store is lower-cased provider names.
export function credentialProviderFor(providerName: string): "openai" | "fireworks" | "together" {
  const normalized = String(providerName || "").toLowerCase();
  if (normalized === "openai") return "openai";
  if (normalized === "fireworks") return "fireworks";
  if (normalized === "together") return "together";
  // Throw rather than silently defaulting — avoids using wrong credential for unknown providers
  throw new Error(`No credential mapping for provider: ${providerName}`);
}
