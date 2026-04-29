import type { FinetuneOps } from "./client";
import type { TraceInput } from "./types";

function normalizeAnthropicOutput(content: unknown) {
  if (!Array.isArray(content)) {
    return JSON.stringify(content ?? "");
  }

  return content
    .map((item) => {
      if (item && typeof item === "object" && "text" in item) {
        return String(item.text);
      }

      return JSON.stringify(item);
    })
    .join("\n");
}

export function wrapAnthropic<T extends object>(client: T, ops: FinetuneOps): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "messages") {
        return Reflect.get(target, prop, receiver);
      }

      const messages = Reflect.get(target, prop, receiver) as Record<string, unknown>;

      return new Proxy(messages, {
        get(messagesTarget, messagesProp, messagesReceiver) {
          if (messagesProp !== "create") {
            return Reflect.get(messagesTarget, messagesProp, messagesReceiver);
          }

          const originalCreate = Reflect.get(
            messagesTarget,
            messagesProp,
            messagesReceiver,
          ) as (params: Record<string, unknown>) => Promise<Record<string, unknown>>;

          return async (params: Record<string, unknown>) => {
            const startedAt = Date.now();
            const response = await originalCreate.call(messagesTarget, params);
            const latency = Date.now() - startedAt;

            const trace: TraceInput = {
              input: JSON.stringify(params.messages ?? []),
              output:
                params.stream === true
                  ? "[streaming]"
                  : normalizeAnthropicOutput(
                      (response as { content?: unknown[] }).content,
                    ),
              model: String(params.model ?? "unknown"),
              latency_ms: latency,
              metadata: {
                inputTokens: (response as { usage?: { input_tokens?: number } }).usage?.input_tokens,
                outputTokens: (response as { usage?: { output_tokens?: number } }).usage?.output_tokens,
                stopReason: (response as { stop_reason?: string }).stop_reason,
              },
            };

            void ops.trace(trace).catch(() => undefined);

            return response;
          };
        },
      });
    },
  });
}
