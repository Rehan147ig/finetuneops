import { TraceBatcher } from "./batcher";
import { wrapAnthropic } from "./wrap-anthropic";
import { wrapOpenAI } from "./wrap-openai";
import type { BatchTracePayload, FinetuneOpsConfig, NormalizedConfig, TraceInput } from "./types";

type PromptTemplateResponse = {
  id: string;
  name: string;
  currentVersion?: {
    content?: string;
  } | null;
};

type PromptCacheEntry = {
  expiresAt: number;
  template: PromptTemplateResponse;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeValue(value: string | object) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}

export class FinetuneOps {
  private config: NormalizedConfig;
  private batcher: TraceBatcher;
  private promptCache = new Map<string, PromptCacheEntry>();

  constructor(config: FinetuneOpsConfig) {
    if (!config.apiKey) {
      throw new Error("FinetuneOps apiKey is required.");
    }

    if (!/^fto_(live|test)_/.test(config.apiKey)) {
      throw new Error("FinetuneOps apiKey must start with fto_live_ or fto_test_.");
    }

    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? "https://api.finetuneops.com",
      workspace: config.workspace ?? "",
      batchSize: config.batchSize ?? 10,
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      debug: config.debug ?? false,
    };

    this.batcher = new TraceBatcher({
      batchSize: this.config.batchSize,
      flushIntervalMs: this.config.flushIntervalMs,
      onFlush: (traces) => this.sendBatch(traces),
      debug: this.config.debug,
    });
  }

  async trace(input: TraceInput): Promise<void> {
    try {
      if (!input || !input.input || !input.output || !input.model) {
        throw new Error("Trace input, output, and model are required.");
      }

      this.batcher.add({
        input: input.input,
        output: input.output,
        model: input.model,
        latency_ms: input.latency_ms,
        tags: input.tags ?? [],
        userId: input.userId,
        sessionId: input.sessionId,
        metadata: input.metadata ?? {},
      });
    } catch (error) {
      if (this.config.debug) {
        console.warn("[finetuneops] trace() failed", error);
      }
    }
  }

  async flush(): Promise<void> {
    await this.batcher.flush();
  }

  async shutdown(): Promise<void> {
    await this.batcher.shutdown();
  }

  async prompt(
    templateName: string,
    variables: Record<string, string> = {},
  ): Promise<string> {
    if (!templateName.trim()) {
      throw new Error("Prompt template name is required.");
    }

    const cacheKey = templateName.trim().toLowerCase();
    const cachedTemplate = this.promptCache.get(cacheKey);

    if (cachedTemplate && cachedTemplate.expiresAt > Date.now()) {
      return this.renderPrompt(cachedTemplate.template, variables, templateName);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey,
      "x-finetuneops-key": this.config.apiKey,
    };

    if (this.config.workspace) {
      headers["x-finetuneops-workspace"] = this.config.workspace;
    }

    const { signal, cleanup } = createTimeoutSignal(10_000);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/prompts?name=${encodeURIComponent(templateName)}`,
        {
          method: "GET",
          headers,
          signal,
        },
      );

      if (response.status === 401) {
        throw new Error("Prompt lookup failed: API key authentication was rejected.");
      }

      if (response.status === 429) {
        throw new Error("Prompt lookup failed: rate limited by FinetuneOps.");
      }

      if (!response.ok) {
        throw new Error(`Prompt lookup failed with status ${response.status}.`);
      }

      const templates = (await response.json()) as PromptTemplateResponse[];
      const template = templates.find(
        (candidate) => candidate.name.toLowerCase() === cacheKey,
      );

      if (!template) {
        throw new Error(`Prompt template "${templateName}" was not found.`);
      }

      this.promptCache.set(cacheKey, {
        template,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      return this.renderPrompt(template, variables, templateName);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error("Prompt lookup failed due to an unknown network error.");
    } finally {
      cleanup();
    }
  }

  wrapOpenAI<T extends object>(client: T): T {
    return wrapOpenAI(client, this);
  }

  wrapAnthropic<T extends object>(client: T): T {
    return wrapAnthropic(client, this);
  }

  private normalizeBatch(traces: TraceInput[]): BatchTracePayload[] {
    return traces.map((trace) => ({
      input: normalizeValue(trace.input),
      output: normalizeValue(trace.output),
      model: trace.model,
      latency_ms: trace.latency_ms ?? 0,
      tags: trace.tags ?? [],
      userId: trace.userId,
      sessionId: trace.sessionId,
      metadata: trace.metadata ?? {},
    }));
  }

  private renderPrompt(
    template: PromptTemplateResponse,
    variables: Record<string, string>,
    templateName: string,
  ) {
    const content = template.currentVersion?.content;

    if (!content) {
      throw new Error(`Prompt template "${templateName}" does not have a current version.`);
    }

    return content.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, variableName: string) => {
      return variables[variableName] ?? `{{${variableName}}}`;
    });
  }

  private async sendBatch(traces: TraceInput[]): Promise<void> {
    const body = JSON.stringify({
      traces: this.normalizeBatch(traces),
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey,
      "x-finetuneops-key": this.config.apiKey,
    };

    if (this.config.workspace) {
      headers["x-finetuneops-workspace"] = this.config.workspace;
    }

    const runRequest = async () => {
      const { signal, cleanup } = createTimeoutSignal(10_000);

      try {
        return await fetch(`${this.config.baseUrl}/api/traces/ingest/batch`, {
          method: "POST",
          headers,
          body,
          signal,
        });
      } catch (error) {
        throw new Error(
          error instanceof Error ? `Network error: ${error.message}` : "Network error",
        );
      } finally {
        cleanup();
      }
    };

    const handleFailure = (message: string) => {
      if (this.config.debug) {
        console.warn(message);
      }
    };

    let response = await runRequest();

    if (response.status === 401) {
      handleFailure("[finetuneops] authentication failed while sending traces");
      return;
    }

    if (response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "1", 10) || 1;
      await sleep(retryAfter * 1000);
      response = await runRequest();

      if (response.status === 429) {
        handleFailure("[finetuneops] trace batch was rate limited after retry");
      }
      return;
    }

    if (response.status >= 500) {
      await sleep(1000);
      response = await runRequest();

      if (response.status >= 500) {
        handleFailure("[finetuneops] server error while sending trace batch");
      }
      return;
    }

    if (!response.ok) {
      handleFailure(`[finetuneops] trace batch was rejected with status ${response.status}`);
    }
  }
}
