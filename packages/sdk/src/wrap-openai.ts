import type { FinetuneOps } from "./client";
import type { TraceInput } from "./types";

function normalizeOutput(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item) {
          return String(item.text);
        }

        return JSON.stringify(item);
      })
      .join("\n");
  }

  return JSON.stringify(content ?? "");
}

export function wrapOpenAI<T extends object>(client: T, ops: FinetuneOps): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "chat") {
        return Reflect.get(target, prop, receiver);
      }

      const chat = Reflect.get(target, prop, receiver) as Record<string, unknown>;

      return new Proxy(chat, {
        get(chatTarget, chatProp, chatReceiver) {
          if (chatProp !== "completions") {
            return Reflect.get(chatTarget, chatProp, chatReceiver);
          }

          const completions = Reflect.get(chatTarget, chatProp, chatReceiver) as Record<string, unknown>;

          return new Proxy(completions, {
            get(completionsTarget, completionsProp, completionsReceiver) {
              if (completionsProp !== "create") {
                return Reflect.get(completionsTarget, completionsProp, completionsReceiver);
              }

              const originalCreate = Reflect.get(
                completionsTarget,
                completionsProp,
                completionsReceiver,
              ) as (params: Record<string, unknown>) => Promise<Record<string, unknown>>;

              return async (params: Record<string, unknown>) => {
                const startedAt = Date.now();
                const response = await originalCreate.call(completionsTarget, params);
                const latency = Date.now() - startedAt;

                const trace: TraceInput = {
                  input: JSON.stringify(params.messages ?? []),
                  output:
                    params.stream === true
                      ? "[streaming]"
                      : normalizeOutput(
                          (response as { choices?: Array<{ message?: { content?: unknown } }> })
                            .choices?.[0]?.message?.content,
                        ),
                  model: String(params.model ?? "unknown"),
                  latency_ms: latency,
                  metadata: {
                    promptTokens: (response as { usage?: { prompt_tokens?: number } }).usage?.prompt_tokens,
                    completionTokens:
                      (response as { usage?: { completion_tokens?: number } }).usage?.completion_tokens,
                    totalTokens: (response as { usage?: { total_tokens?: number } }).usage?.total_tokens,
                    finishReason:
                      (response as { choices?: Array<{ finish_reason?: string }> }).choices?.[0]
                        ?.finish_reason,
                  },
                };

                void ops.trace(trace).catch(() => undefined);

                return response;
              };
            },
          });
        },
      });
    },
  });
}
