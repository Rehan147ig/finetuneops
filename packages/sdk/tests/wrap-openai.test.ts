import { describe, expect, it, vi } from "vitest";
import { wrapOpenAI } from "../src/wrap-openai";

describe("wrapOpenAI", () => {
  it("returns proxy that behaves like original client", async () => {
    const client = {
      name: "openai-client",
      ping: () => "pong",
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "answer" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          }),
        },
      },
    };
    const ops = {
      trace: vi.fn().mockResolvedValue(undefined),
    } as never;

    const wrapped = wrapOpenAI(client, ops);

    expect(wrapped.name).toBe("openai-client");
    expect(wrapped.ping()).toBe("pong");
    await wrapped.chat.completions.create({ model: "gpt-4o-mini", messages: [] });
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("traces are captured after chat completion", async () => {
    const trace = vi.fn().mockResolvedValue(undefined);
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "assistant answer" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 },
          }),
        },
      },
    };

    const wrapped = wrapOpenAI(client, { trace } as never);
    await wrapped.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
    });
    await Promise.resolve();

    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        output: "assistant answer",
      }),
    );
  });

  it("latency_ms is positive number", async () => {
    const trace = vi.fn().mockResolvedValue(undefined);
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 2));
            return {
              choices: [{ message: { content: "assistant answer" }, finish_reason: "stop" }],
              usage: {},
            };
          }),
        },
      },
    };

    const wrapped = wrapOpenAI(client, { trace } as never);
    await wrapped.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
    });
    await Promise.resolve();

    expect(trace.mock.calls[0]?.[0]?.latency_ms).toBeGreaterThan(0);
  });

  it("model name is captured correctly", async () => {
    const trace = vi.fn().mockResolvedValue(undefined);
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "assistant answer" }, finish_reason: "stop" }],
            usage: {},
          }),
        },
      },
    };

    const wrapped = wrapOpenAI(client, { trace } as never);
    await wrapped.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "hello" }],
    });
    await Promise.resolve();

    expect(trace.mock.calls[0]?.[0]?.model).toBe("gpt-4.1-mini");
  });

  it("streaming calls traced with output: streaming", async () => {
    const trace = vi.fn().mockResolvedValue(undefined);
    const response = { stream: true };
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(response),
        },
      },
    };

    const wrapped = wrapOpenAI(client, { trace } as never);
    const result = await wrapped.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages: [{ role: "user", content: "hello" }],
    });
    await Promise.resolve();

    expect(result).toBe(response);
    expect(trace.mock.calls[0]?.[0]?.output).toBe("[streaming]");
  });

  it("original response is unchanged", async () => {
    const trace = vi.fn().mockResolvedValue(undefined);
    const response = {
      choices: [{ message: { content: "assistant answer" }, finish_reason: "stop" }],
      usage: {},
    };
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(response),
        },
      },
    };

    const wrapped = wrapOpenAI(client, { trace } as never);
    const result = await wrapped.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result).toBe(response);
  });

  it("tracing failure does not affect response", async () => {
    const trace = vi.fn().mockRejectedValue(new Error("trace failed"));
    const response = {
      choices: [{ message: { content: "assistant answer" }, finish_reason: "stop" }],
      usage: {},
    };
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(response),
        },
      },
    };

    const wrapped = wrapOpenAI(client, { trace } as never);
    const result = await wrapped.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
    });
    await Promise.resolve();

    expect(result).toBe(response);
  });
});
