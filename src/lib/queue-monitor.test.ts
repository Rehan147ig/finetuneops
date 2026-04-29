import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getBackgroundJobQueue,
  loggerWarn,
  loggerError,
  loggerInfo,
  getServerEnvMock,
  fetchMock,
} = vi.hoisted(() => ({
  getBackgroundJobQueue: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  getServerEnvMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/background-jobs", () => ({
  getBackgroundJobQueue,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarn,
    error: loggerError,
    info: loggerInfo,
  },
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: getServerEnvMock,
}));

function mockQueueState(states: Record<string, { waiting: number; active: number }>) {
  getBackgroundJobQueue.mockImplementation((name: string) => {
    const state = states[name];

    if (!state) {
      throw new Error(`Queue not mocked: ${name}`);
    }

    return {
      getWaitingCount: vi.fn().mockResolvedValue(state.waiting),
      getActiveCount: vi.fn().mockResolvedValue(state.active),
      close: vi.fn().mockResolvedValue(undefined),
    };
  });
}

describe("queue monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerEnvMock.mockReturnValue({
      INTERNAL_SLACK_WEBHOOK: "",
    });
    fetchMock.mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);
    mockQueueState({
      "ingest-trace": { waiting: 10, active: 2 },
      "score-dataset": { waiting: 0, active: 0 },
      "launch-finetune": { waiting: 0, active: 0 },
      "poll-finetune": { waiting: 0, active: 0 },
      "send-notification": { waiting: 0, active: 0 },
    });
  });

  it("returns ok level when queue is under warning threshold", async () => {
    const { getQueueStats } = await import("./queue-monitor");
    const stats = await getQueueStats();

    expect(stats.find((queue) => queue.name === "ingest-trace")?.level).toBe("ok");
  });

  it("returns warning level at warning threshold", async () => {
    mockQueueState({
      "ingest-trace": { waiting: 500, active: 2 },
      "score-dataset": { waiting: 0, active: 0 },
      "launch-finetune": { waiting: 0, active: 0 },
      "poll-finetune": { waiting: 0, active: 0 },
      "send-notification": { waiting: 0, active: 0 },
    });

    const { getQueueStats } = await import("./queue-monitor");
    const stats = await getQueueStats();

    expect(stats.find((queue) => queue.name === "ingest-trace")?.level).toBe("warning");
  });

  it("returns critical level at critical threshold", async () => {
    mockQueueState({
      "ingest-trace": { waiting: 2000, active: 2 },
      "score-dataset": { waiting: 0, active: 0 },
      "launch-finetune": { waiting: 0, active: 0 },
      "poll-finetune": { waiting: 0, active: 0 },
      "send-notification": { waiting: 0, active: 0 },
    });

    const { getQueueStats } = await import("./queue-monitor");
    const stats = await getQueueStats();

    expect(stats.find((queue) => queue.name === "ingest-trace")?.level).toBe("critical");
  });

  it("logs warning event at warning level", async () => {
    mockQueueState({
      "ingest-trace": { waiting: 500, active: 4 },
      "score-dataset": { waiting: 0, active: 0 },
      "launch-finetune": { waiting: 0, active: 0 },
      "poll-finetune": { waiting: 0, active: 0 },
      "send-notification": { waiting: 0, active: 0 },
    });

    const { checkQueuesAndAlert } = await import("./queue-monitor");
    await checkQueuesAndAlert();

    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "queue_depth_warning",
        queue: "ingest-trace",
        threshold: 500,
      }),
    );
  });

  it("logs error event at critical level", async () => {
    mockQueueState({
      "ingest-trace": { waiting: 2000, active: 4 },
      "score-dataset": { waiting: 0, active: 0 },
      "launch-finetune": { waiting: 0, active: 0 },
      "poll-finetune": { waiting: 0, active: 0 },
      "send-notification": { waiting: 0, active: 0 },
    });

    const { checkQueuesAndAlert } = await import("./queue-monitor");
    await checkQueuesAndAlert();

    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "queue_depth_critical",
        queue: "ingest-trace",
        threshold: 2000,
      }),
    );
  });

  it("sends an internal Slack alert on critical queues when configured", async () => {
    getServerEnvMock.mockReturnValue({
      INTERNAL_SLACK_WEBHOOK: "https://hooks.slack.com/services/internal/test",
    });
    mockQueueState({
      "ingest-trace": { waiting: 2847, active: 9 },
      "score-dataset": { waiting: 0, active: 0 },
      "launch-finetune": { waiting: 0, active: 0 },
      "poll-finetune": { waiting: 0, active: 0 },
      "send-notification": { waiting: 0, active: 0 },
    });

    const { checkQueuesAndAlert } = await import("./queue-monitor");
    await checkQueuesAndAlert();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/internal/test",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("shouldApplyBackpressure returns false when all ok", async () => {
    const { shouldApplyBackpressure } = await import("./queue-monitor");

    expect(
      shouldApplyBackpressure([
        { name: "ingest-trace", waiting: 10, active: 1, level: "ok" },
      ]),
    ).toBe(false);
  });

  it("shouldApplyBackpressure returns false when warning only", async () => {
    const { shouldApplyBackpressure } = await import("./queue-monitor");

    expect(
      shouldApplyBackpressure([
        { name: "ingest-trace", waiting: 500, active: 1, level: "warning" },
      ]),
    ).toBe(false);
  });

  it("shouldApplyBackpressure returns true when any critical", async () => {
    const { shouldApplyBackpressure } = await import("./queue-monitor");

    expect(
      shouldApplyBackpressure([
        { name: "ingest-trace", waiting: 2000, active: 1, level: "critical" },
      ]),
    ).toBe(true);
  });

  it("does not throw when queue client unavailable", async () => {
    getBackgroundJobQueue.mockImplementation(() => {
      throw new Error("Redis unavailable");
    });

    const { getQueueStats } = await import("./queue-monitor");

    await expect(getQueueStats()).resolves.toEqual([]);
  });
});
