import { beforeEach, describe, expect, it, vi } from "vitest";
import { TraceBatcher } from "../src/batcher";

describe("TraceBatcher", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("adds trace to queue", async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const batcher = new TraceBatcher({
      batchSize: 2,
      flushIntervalMs: 1000,
      onFlush,
    });

    batcher.add({
      input: "input",
      output: "output",
      model: "gpt-4o-mini",
    });

    await batcher.shutdown();

    expect(onFlush).toHaveBeenCalledWith([
      {
        input: "input",
        output: "output",
        model: "gpt-4o-mini",
      },
    ]);
  });

  it("flushes when batch size reached", async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const batcher = new TraceBatcher({
      batchSize: 2,
      flushIntervalMs: 1000,
      onFlush,
    });

    batcher.add({ input: "a", output: "b", model: "gpt-4o-mini" });
    batcher.add({ input: "c", output: "d", model: "gpt-4o-mini" });

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
  });

  it("flushes on interval", async () => {
    vi.useFakeTimers();
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const batcher = new TraceBatcher({
      batchSize: 10,
      flushIntervalMs: 50,
      onFlush,
    });

    batcher.add({ input: "a", output: "b", model: "gpt-4o-mini" });
    await vi.advanceTimersByTimeAsync(50);

    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("does not throw when onFlush fails", async () => {
    const onFlush = vi.fn().mockRejectedValue(new Error("boom"));
    const batcher = new TraceBatcher({
      batchSize: 1,
      flushIntervalMs: 50,
      onFlush,
    });

    expect(() => {
      batcher.add({ input: "a", output: "b", model: "gpt-4o-mini" });
    }).not.toThrow();

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
  });

  it("shutdown flushes remaining items", async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const batcher = new TraceBatcher({
      batchSize: 10,
      flushIntervalMs: 1000,
      onFlush,
    });

    batcher.add({ input: "a", output: "b", model: "gpt-4o-mini" });
    await batcher.shutdown();

    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("offline mode queues on network failure", async () => {
    const onFlush = vi.fn().mockRejectedValue(new Error("Network offline"));
    const batcher = new TraceBatcher({
      batchSize: 1,
      flushIntervalMs: 1000,
      onFlush,
    });

    batcher.add({ input: "a", output: "b", model: "gpt-4o-mini" });

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });

    onFlush.mockResolvedValue(undefined);
    await batcher.flush();

    expect(onFlush).toHaveBeenCalledTimes(2);
    expect(onFlush.mock.calls[1]?.[0]).toHaveLength(1);
  });

  it("drops oldest when offline queue exceeds 1000", async () => {
    const onFlush = vi.fn().mockRejectedValue(new Error("Network timeout"));
    const batcher = new TraceBatcher({
      batchSize: 1001,
      flushIntervalMs: 1000,
      onFlush,
    });

    for (let index = 0; index < 1001; index += 1) {
      batcher.add({
        input: `input-${index}`,
        output: `output-${index}`,
        model: "gpt-4o-mini",
      });
    }

    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });

    onFlush.mockResolvedValue(undefined);
    await batcher.flush();

    const retriedBatch = onFlush.mock.calls[1]?.[0] as Array<{ input: string }>;
    expect(retriedBatch).toHaveLength(1000);
    expect(retriedBatch[0]?.input).toBe("input-1");
  });
});
