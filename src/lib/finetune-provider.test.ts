import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests focus on the retry/backoff behavior of restFetch, exercised through the
// exported provider adapters. Since restFetch retries on transient failures
// (429, 5xx, network/timeout), we mock global fetch and fake the timers so the
// exponential backoff sleeps don't slow the suite down.

import { getFineTuneProvider } from "./finetune-provider";

function makeResponse(init: { ok?: boolean; status?: number; body?: unknown; headers?: Record<string, string> }) {
  const status = init.status ?? (init.ok ? 200 : 500);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers ?? {}),
    json: async () => init.body ?? {},
  } as Response;
}

describe("finetune-provider retry logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries on a transient 5xx error then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ status: 503 }))
      .mockResolvedValueOnce(makeResponse({ status: 502 }))
      .mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: {
            status: "completed",
            model_output_name: "ft-together-1",
            token_count: 100,
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = getFineTuneProvider("together");
    const pollPromise = provider.pollFineTune({
      apiKey: "key",
      providerJobId: "job_1",
      modelBase: "meta-llama/Llama-3-70B",
    });

    // Advance through the two backoff sleeps.
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await pollPromise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.status).toBe("succeeded");
    expect(result.fineTunedModelId).toBe("ft-together-1");
  });

  it("returns the failing response after exhausting retries on persistent 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = getFineTuneProvider("together");
    const pollPromise = provider.pollFineTune({
      apiKey: "key",
      providerJobId: "job_1",
      modelBase: "meta-llama/Llama-3-70B",
    });

    // Attach the rejection handler BEFORE advancing timers, so the rejection
    // raised by the adapter throw is never unhandled.
    const assertion = expect(pollPromise).rejects.toThrow("Together poll failed: 429");
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;

    // restFetch retried 3x total (1 initial + 2 retries) before returning the
    // 429 response, which the adapter then turned into a throw.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry on a non-retriable 4xx auth error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = getFineTuneProvider("together");
    const pollPromise = provider.pollFineTune({
      apiKey: "bad-key",
      providerJobId: "job_1",
      modelBase: "meta-llama/Llama-3-70B",
    });

    // No timers to advance — no retry should occur. restFetch returns the 401
    // immediately; the adapter throws because the response is not ok.
    await expect(pollPromise).rejects.toThrow("Together poll failed: 401");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on a network error then succeeds", async () => {
    const networkError = new TypeError("fetch failed");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: { status: "running" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = getFineTuneProvider("together");
    const pollPromise = provider.pollFineTune({
      apiKey: "key",
      providerJobId: "job_1",
      modelBase: "meta-llama/Llama-3-70B",
    });

    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pollPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("running");
  });
});
