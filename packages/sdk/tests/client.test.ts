import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinetuneOps } from "../src/client";

describe("FinetuneOps client", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws on missing apiKey", () => {
    expect(() => new FinetuneOps({ apiKey: "" })).toThrow("apiKey is required");
  });

  it("throws on invalid apiKey format", () => {
    expect(() => new FinetuneOps({ apiKey: "bad_key" })).toThrow(
      "must start with fto_live_ or fto_test_",
    );
  });

  it("trace() does not throw on invalid input", async () => {
    const ops = new FinetuneOps({ apiKey: "fto_test_1234" });

    await expect(
      ops.trace({
        input: "",
        output: "ok",
        model: "",
      }),
    ).resolves.toBeUndefined();
  });

  it("trace() adds to batcher queue", async () => {
    const ops = new FinetuneOps({ apiKey: "fto_test_1234" }) as unknown as {
      batcher: { add: ReturnType<typeof vi.fn> };
      trace: FinetuneOps["trace"];
    };
    const addSpy = vi.spyOn(ops.batcher, "add");

    await ops.trace({
      input: "user question",
      output: "assistant answer",
      model: "gpt-4o-mini",
    });

    expect(addSpy).toHaveBeenCalledTimes(1);
  });

  it("flush() sends batch to API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);
    const ops = new FinetuneOps({
      apiKey: "fto_test_1234",
      batchSize: 10,
      flushIntervalMs: 5000,
    });

    await ops.trace({
      input: "user question",
      output: "assistant answer",
      model: "gpt-4o-mini",
    });
    await ops.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sendBatch retries on 429 with retryAfter", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "2" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
      });
    vi.stubGlobal("fetch", fetchMock);
    const ops = new FinetuneOps({ apiKey: "fto_test_1234" }) as unknown as {
      sendBatch: (traces: Array<Record<string, unknown>>) => Promise<void>;
    };

    const promise = ops.sendBatch([
      {
        input: "user question",
        output: "assistant answer",
        model: "gpt-4o-mini",
      },
    ]);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sendBatch stops retrying on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);
    const ops = new FinetuneOps({ apiKey: "fto_test_1234" }) as unknown as {
      sendBatch: (traces: Array<Record<string, unknown>>) => Promise<void>;
    };

    await ops.sendBatch([
      {
        input: "user question",
        output: "assistant answer",
        model: "gpt-4o-mini",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sendBatch retries once on 500", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
      });
    vi.stubGlobal("fetch", fetchMock);
    const ops = new FinetuneOps({ apiKey: "fto_test_1234" }) as unknown as {
      sendBatch: (traces: Array<Record<string, unknown>>) => Promise<void>;
    };

    const promise = ops.sendBatch([
      {
        input: "user question",
        output: "assistant answer",
        model: "gpt-4o-mini",
      },
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prompt() returns the rendered current prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue([
        {
          id: "template_1",
          name: "customer-support",
          currentVersion: {
            content: "Hello {{customer_name}}, issue: {{issue}}",
          },
        },
      ]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const ops = new FinetuneOps({ apiKey: "fto_test_1234" });

    const prompt = await ops.prompt("customer-support", {
      customer_name: "Alex",
      issue: "refund request",
    });

    expect(prompt).toBe("Hello Alex, issue: refund request");
  });

  it("prompt() caches template lookups for five minutes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue([
        {
          id: "template_1",
          name: "customer-support",
          currentVersion: {
            content: "Hello {{customer_name}}",
          },
        },
      ]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const ops = new FinetuneOps({ apiKey: "fto_test_1234" });

    await ops.prompt("customer-support", { customer_name: "Alex" });
    await ops.prompt("customer-support", { customer_name: "Sam" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prompt() throws when template is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue([]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const ops = new FinetuneOps({ apiKey: "fto_test_1234" });

    await expect(ops.prompt("missing-template")).rejects.toThrow("was not found");
  });
});
