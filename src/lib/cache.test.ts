import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockSet, mockDel, mockScan, mockIncr, mockGetRedisClient, mockLogger } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockDel: vi.fn(),
  mockScan: vi.fn(),
  mockIncr: vi.fn(),
  mockGetRedisClient: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: mockLogger,
}));

describe("cache helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetRedisClient.mockReturnValue({
      get: mockGet,
      set: mockSet,
      del: mockDel,
      scan: mockScan,
      incr: mockIncr,
    });
  });

  it("returns cached value on cache hit", async () => {
    mockGet.mockResolvedValue(JSON.stringify({ plan: "pro" }));
    const compute = vi.fn();
    const { cached } = await import("./cache");

    const result = await cached("cache:workspace:org_1:plan", 300, compute);

    expect(result).toEqual({ plan: "pro" });
    expect(compute).not.toHaveBeenCalled();
  });

  it("calls fn and stores result on cache miss", async () => {
    mockGet.mockResolvedValue(null);
    const compute = vi.fn().mockResolvedValue({ plan: "starter" });
    const { cached } = await import("./cache");

    const result = await cached("cache:workspace:org_1:plan", 300, compute);

    expect(result).toEqual({ plan: "starter" });
    expect(mockSet).toHaveBeenCalledWith(
      "cache:workspace:org_1:plan",
      JSON.stringify({ plan: "starter" }),
      "EX",
      300,
    );
  });

  it("calls fn directly when Redis unavailable", async () => {
    mockGetRedisClient.mockReturnValue(null);
    const compute = vi.fn().mockResolvedValue({ ok: true });
    const { cached } = await import("./cache");

    const result = await cached("cache:workspace:org_1:plan", 300, compute);

    expect(result).toEqual({ ok: true });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("calls fn when JSON parse fails", async () => {
    mockGet.mockResolvedValue("invalid json{{{");
    const compute = vi.fn().mockResolvedValue({ recovered: true });
    const { cached } = await import("./cache");

    const result = await cached("cache:workspace:org_1:plan", 300, compute);

    expect(result).toEqual({ recovered: true });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("invalidate calls DEL with correct key", async () => {
    const { invalidate } = await import("./cache");

    await invalidate("cache:workspace:org_1:plan");

    expect(mockDel).toHaveBeenCalledWith("cache:workspace:org_1:plan");
  });

  it("invalidatePattern scans and deletes matched keys", async () => {
    mockScan
      .mockResolvedValueOnce(["1", ["cache:workspace:org_1:plan"]])
      .mockResolvedValueOnce(["0", ["cache:workspace:org_1:usage"]]);
    const { invalidatePattern } = await import("./cache");

    await invalidatePattern("cache:workspace:org_1:*");

    expect(mockScan).toHaveBeenCalledTimes(2);
    expect(mockDel).toHaveBeenCalledWith("cache:workspace:org_1:plan");
    expect(mockDel).toHaveBeenCalledWith("cache:workspace:org_1:usage");
  });

  it("cache error does not throw and calls fn instead", async () => {
    mockGet.mockRejectedValue(new Error("Redis timeout"));
    const compute = vi.fn().mockResolvedValue({ fallback: true });
    const { cached } = await import("./cache");

    const result = await cached("cache:workspace:org_1:plan", 300, compute);

    expect(result).toEqual({ fallback: true });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("workspace plan is cached with 300s TTL", async () => {
    const { CacheTTL } = await import("./cache");

    expect(CacheTTL.workspacePlan).toBe(300);
  });

  it("dataset quality is cached with 3600s TTL", async () => {
    const { CacheTTL } = await import("./cache");

    expect(CacheTTL.datasetQuality).toBe(3600);
  });
});
