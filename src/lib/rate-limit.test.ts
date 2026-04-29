import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockIncr, mockPexpire, mockConnect, mockOn } = vi.hoisted(() => ({
  mockIncr: vi.fn(),
  mockPexpire: vi.fn(),
  mockConnect: vi.fn(),
  mockOn: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: class Redis {
    status = "wait";
    incr = mockIncr;
    pexpire = mockPexpire;
    connect = mockConnect;
    on = mockOn;
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-04-24T07:00:30.000Z").getTime());
    mockConnect.mockResolvedValue(undefined);
    mockPexpire.mockResolvedValue(1);
  });

  it("allows request when under the limit", async () => {
    mockIncr.mockResolvedValue(1);
    const { checkRateLimit } = await import("./rate-limit");

    const result = await checkRateLimit("org_1", "api");

    expect(result).toEqual({
      allowed: true,
      limit: 100,
      remaining: 99,
      reset: 1777014060,
    });
  });

  it("allows request at exactly the limit", async () => {
    mockIncr.mockResolvedValue(100);
    const { checkRateLimit } = await import("./rate-limit");

    const result = await checkRateLimit("org_1", "api");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("blocks request when over the limit", async () => {
    mockIncr.mockResolvedValue(101);
    const { checkRateLimit } = await import("./rate-limit");

    const result = await checkRateLimit("org_1", "api");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("different orgs have independent limits", async () => {
    mockIncr
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(1);
    const { checkRateLimit } = await import("./rate-limit");

    const orgOne = await checkRateLimit("org_1", "api");
    const orgTwo = await checkRateLimit("org_2", "api");

    expect(orgOne.allowed).toBe(true);
    expect(orgTwo.allowed).toBe(true);
    expect(mockIncr.mock.calls[0]?.[0]).toContain("ratelimit:api:org_1:");
    expect(mockIncr.mock.calls[1]?.[0]).toContain("ratelimit:api:org_2:");
  });

  it("different tiers are independent", async () => {
    mockIncr
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1);
    const { checkRateLimit } = await import("./rate-limit");

    const traces = await checkRateLimit("org_1", "traces");
    const api = await checkRateLimit("org_1", "api");

    expect(traces.allowed).toBe(true);
    expect(traces.remaining).toBe(0);
    expect(api.allowed).toBe(true);
    expect(api.remaining).toBe(99);
    expect(mockIncr.mock.calls[0]?.[0]).toContain("ratelimit:traces:org_1:");
    expect(mockIncr.mock.calls[1]?.[0]).toContain("ratelimit:api:org_1:");
  });

  it("allows request when Redis is unavailable", async () => {
    mockIncr.mockRejectedValue(new Error("connection refused"));
    const { checkRateLimit } = await import("./rate-limit");

    const result = await checkRateLimit("org_1", "api");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(100);
  });

  it("returns correct headers object", async () => {
    const { rateLimitHeaders } = await import("./rate-limit");

    expect(
      rateLimitHeaders({ allowed: true, limit: 100, remaining: 47, reset: 1234567890 }),
    ).toEqual({
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": "47",
      "X-RateLimit-Reset": "1234567890",
    });
  });
});
