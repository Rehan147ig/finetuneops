import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindMany,
  mockTraceCount,
  mockTrainingJobCount,
  mockGetQueueStats,
  mockGetCacheMetrics,
  mockGetServerEnv,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockTraceCount: vi.fn(),
  mockTrainingJobCount: vi.fn(),
  mockGetQueueStats: vi.fn(),
  mockGetCacheMetrics: vi.fn(),
  mockGetServerEnv: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    traceEvent: {
      findMany: mockFindMany,
      count: mockTraceCount,
    },
    trainingJob: {
      count: mockTrainingJobCount,
    },
  },
}));

vi.mock("@/lib/queue-monitor", () => ({
  getQueueStats: mockGetQueueStats,
}));

vi.mock("@/lib/system-status", () => ({
  getCacheMetrics: mockGetCacheMetrics,
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: mockGetServerEnv,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: mockLoggerWarn,
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { GET } from "./route";

describe("GET /api/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerEnv.mockReturnValue({
      ADMIN_SECRET: "admin-secret",
    });
    mockFindMany.mockResolvedValue([
      { project: { organizationId: "org_1" } },
      { project: { organizationId: "org_2" } },
    ]);
    mockTraceCount.mockResolvedValue(42);
    mockTrainingJobCount.mockResolvedValue(3);
    mockGetQueueStats.mockResolvedValue([
      { name: "ingest-trace", waiting: 12, active: 2, level: "ok" },
    ]);
    mockGetCacheMetrics.mockResolvedValue({
      hits: 10,
      misses: 5,
      hitRate: 10 / 15,
    });
  });

  it("returns 401 without admin secret", async () => {
    const response = await GET(new Request("http://localhost/api/metrics"));

    expect(response.status).toBe(401);
  });

  it("returns 401 with wrong admin secret", async () => {
    const response = await GET(
      new Request("http://localhost/api/metrics", {
        headers: {
          authorization: "Bearer wrong-secret",
        },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns metrics when authenticated", async () => {
    const response = await GET(
      new Request("http://localhost/api/metrics", {
        headers: {
          authorization: "Bearer admin-secret",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      activeWorkspaces24h: 2,
      tracesLastHour: 42,
      finetuneJobsRunning: 3,
      cache: {
        hits: 10,
        misses: 5,
      },
    });
    expect(Array.isArray(body.queues)).toBe(true);
    expect(typeof body.collectedAt).toBe("string");
  });

  it("returns null for failed metric collection", async () => {
    mockTraceCount.mockRejectedValue(new Error("count failed"));

    const response = await GET(
      new Request("http://localhost/api/metrics", {
        headers: {
          authorization: "Bearer admin-secret",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tracesLastHour).toBeNull();
    expect(body.activeWorkspaces24h).toBe(2);
    expect(body.finetuneJobsRunning).toBe(3);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "metrics_collection_failed",
        metric: "traces_last_hour",
      }),
    );
  });
});
