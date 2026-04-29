import { describe, expect, it, vi } from "vitest";
import { wrapAnthropic } from "../src/wrap-anthropic";

describe("wrapAnthropic", () => {
  it("returns proxy that behaves like original client", async () => {
    const client = {
      version: "anthropic-client",
      ping: () => "pong",
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: "answer" }],
          usage: { input_tokens: 1, output_tokens: 2 },
          stop_reason: "end_turn",
        }),
      },
    };
    const ops = {
      trace: vi.fn().mockResolvedValue(undefined),
    } as never;

    const wrapped = wrapAnthropic(client, ops);

    expect(wrapped.version).toBe("anthropic-client");
    expect(wrapped.ping()).toBe("pong");
    await wrapped.messages.create({ model: "claude-3-5-sonnet", messages: [] });
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });

  it("traces are captured after message creation", async () => {
    const trace = vi.fn().mockResolvedValue(undefined);
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: "assistant answer" }],
          usage: { input_tokens: 11, output_tokens: 5 },
          stop_reason: "end_turn",
        }),
      },
    };

    const wrapped = wrapAnthropic(client, { trace } as never);
    await wrapped.messages.create({
      model: "claude-3-5-sonnet",
      messages: [{ role: "user", content: "hello" }],
    });
    await Promise.resolve();

    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-3-5-sonnet",
        output: "assistant answer",
      }),
    );
  });

  it("latency_ms is positive number", async () => {
    const trace = vi.fn().mockResolvedValue(undefined);
    const client = {
      messages: {
        create: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2));
          return {
            content: [{ text: "assistant answer" }],
            usage: {},
          };
        }),
      },
    };

    const wrapped = wrapAnthropic(client, { trace } as never);
    await wrapped.messages.create({
      model: "claude-3-5-sonnet",
      messages: [{ role: "user", content: "hello" }],
    });
    await Promise.resolve();

    expect(trace.mock.calls[0]?.[0]?.latency_ms).toBeGreaterThan(0);
  });

  it("model name is captured correctly", async () => {
    const trace = vi.fn().mockResolvedValue(undefined);
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: "assistant answer" }],
          usage: {},
        }),
      },
    };

    const wrapped = wrapAnthropic(client, { trace } as never);
    await wrapped.messages.create({
      model: "claude-3-7-sonnet",
      messages: [{ role: "user", content: "hello" }],
    });
    await Promise.resolve();

    expect(trace.mock.calls[0]?.[0]?.model).toBe("claude-3-7-sonnet");
  });

  it("streaming calls traced with output: streaming", async () => {
    const trace = vi.fn().mockResolvedValue(undefined);
    const response = { stream: true };
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue(response),
      },
    };

    const wrapped = wrapAnthropic(client, { trace } as never);
    const result = await wrapped.messages.create({
      model: "claude-3-5-sonnet",
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
      content: [{ text: "assistant answer" }],
      usage: {},
    };
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue(response),
      },
    };

    const wrapped = wrapAnthropic(client, { trace } as never);
    const result = await wrapped.messages.create({
      model: "claude-3-5-sonnet",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result).toBe(response);
  });

  it("tracing failure does not affect response", async () => {
    const trace = vi.fn().mockRejectedValue(new Error("trace failed"));
    const response = {
      content: [{ text: "assistant answer" }],
      usage: {},
    };
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue(response),
      },
    };

    const wrapped = wrapAnthropic(client, { trace } as never);
    const result = await wrapped.messages.create({
      model: "claude-3-5-sonnet",
      messages: [{ role: "user", content: "hello" }],
    });
    await Promise.resolve();

    expect(result).toBe(response);
  });
});
