import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCached,
  mockTraceCount,
  mockDatasetCount,
  mockExperimentCount,
  mockTrainingJobCount,
  mockDatasetQualityFindMany,
  mockTraceFindMany,
  mockTrainingJobFindMany,
  mockActivityLogFindMany,
  mockUserFindMany,
} = vi.hoisted(() => ({
  mockCached: vi.fn(),
  mockTraceCount: vi.fn(),
  mockDatasetCount: vi.fn(),
  mockExperimentCount: vi.fn(),
  mockTrainingJobCount: vi.fn(),
  mockDatasetQualityFindMany: vi.fn(),
  mockTraceFindMany: vi.fn(),
  mockTrainingJobFindMany: vi.fn(),
  mockActivityLogFindMany: vi.fn(),
  mockUserFindMany: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  cached: mockCached,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    traceEvent: {
      count: mockTraceCount,
      findMany: mockTraceFindMany,
    },
    dataset: {
      count: mockDatasetCount,
    },
    experimentRun: {
      count: mockExperimentCount,
    },
    trainingJob: {
      count: mockTrainingJobCount,
      findMany: mockTrainingJobFindMany,
    },
    datasetQualityReport: {
      findMany: mockDatasetQualityFindMany,
    },
    activityLog: {
      findMany: mockActivityLogFindMany,
    },
    user: {
      findMany: mockUserFindMany,
    },
  },
}));

describe("analytics-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T12:00:00.000Z"));
    mockCached.mockImplementation(async (_key, _ttl, fn) => fn());
  });

  it("getAnalyticsSummary returns correct totals", async () => {
    mockTraceCount
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(70)
      .mockResolvedValueOnce(14);
    mockDatasetCount.mockResolvedValue(5);
    mockExperimentCount.mockResolvedValue(8);
    mockTrainingJobCount.mockResolvedValueOnce(4).mockResolvedValueOnce(3);
    mockDatasetQualityFindMany.mockResolvedValue([{ healthScore: 90 }, { healthScore: 70 }]);

    const { getAnalyticsSummary } = await import("./analytics-data");
    const result = await getAnalyticsSummary("org_1");

    expect(result).toEqual({
      tracesTotal: 100,
      tracesLast24h: 20,
      tracesLast7d: 70,
      errorRateLast7d: 0.2,
      datasetsTotal: 5,
      experimentsTotal: 8,
      finetunesTotal: 4,
      finetunesSucceeded: 3,
      avgDatasetHealthScore: 80,
    });
  });

  it("getTracesPerDay fills missing days with zero", async () => {
    mockTraceFindMany.mockResolvedValue([
      { capturedAt: new Date("2026-04-18T10:00:00.000Z") },
      { capturedAt: new Date("2026-04-20T10:00:00.000Z") },
      { capturedAt: new Date("2026-04-24T10:00:00.000Z") },
    ]);

    const { getTracesPerDay } = await import("./analytics-data");
    const result = await getTracesPerDay("org_1", 7);

    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ day: "2026-04-18", count: 1 });
    expect(result[1]).toEqual({ day: "2026-04-19", count: 0 });
    expect(result[2]).toEqual({ day: "2026-04-20", count: 1 });
    expect(result[6]).toEqual({ day: "2026-04-24", count: 1 });
  });

  it("getModelBreakdown calculates error rate correctly", async () => {
    mockTraceFindMany.mockResolvedValue([
      ...new Array(8).fill(null).map(() => ({ modelName: "gpt-4o-mini", status: "triaged" })),
      ...new Array(2).fill(null).map(() => ({ modelName: "gpt-4o-mini", status: "failed" })),
    ]);

    const { getModelBreakdown } = await import("./analytics-data");
    const result = await getModelBreakdown("org_1", 30);

    expect(result).toEqual([
      {
        model: "gpt-4o-mini",
        count: 10,
        errorRate: 0.2,
      },
    ]);
  });

  it("getEvalTrends returns last 10 jobs ordered by date", async () => {
    mockTrainingJobFindMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        name: `job-${index}`,
        modelBase: "gpt-4o-mini",
        validationLoss: 0.1,
        trainedTokens: 1000 + index,
        finishedAt: new Date(`2026-04-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`),
        gpuHours: 2,
      })),
    );

    const { getEvalTrends } = await import("./analytics-data");
    const result = await getEvalTrends("org_1");

    expect(result).toHaveLength(10);
    expect(result[0]?.version).toBe("job-11");
    expect(result[9]?.version).toBe("job-2");
  });

  it("getDateRange returns correct from/to for 7d", async () => {
    const { getDateRange } = await import("./analytics-data");
    const result = getDateRange("7d");

    expect(result.from.toISOString()).toBe("2026-04-18T12:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-04-24T12:00:00.000Z");
  });

  it("getDateRange returns correct from/to for 30d", async () => {
    const { getDateRange } = await import("./analytics-data");
    const result = getDateRange("30d");

    expect(result.from.toISOString()).toBe("2026-03-26T12:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-04-24T12:00:00.000Z");
  });

  it("getDateRange returns correct from/to for 90d", async () => {
    const { getDateRange } = await import("./analytics-data");
    const result = getDateRange("90d");

    expect(result.from.toISOString()).toBe("2026-01-25T12:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-04-24T12:00:00.000Z");
  });
});
