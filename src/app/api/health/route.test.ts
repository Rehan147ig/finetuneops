import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQueryRaw, mockGetRedisClient, mockPing, mockConnect } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockGetRedisClient: vi.fn(),
  mockPing: vi.fn(),
  mockConnect: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.npm_package_version = "0.1.0";
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockPing.mockResolvedValue("PONG");
    mockConnect.mockResolvedValue(undefined);
    mockGetRedisClient.mockReturnValue({
      status: "ready",
      ping: mockPing,
      connect: mockConnect,
    });
  });

  it("returns 200 and status ok when all services up", async () => {
    const response = await GET(new Request("http://localhost/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      postgres: "ok",
      redis: "ok",
    });
  });

  it("returns 503 and status down when Postgres fails", async () => {
    mockQueryRaw.mockRejectedValue(new Error("db down"));

    const response = await GET(new Request("http://localhost/api/health"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("down");
    expect(body.postgres).toBe("error");
  });

  it("returns 200 and status degraded when Redis fails", async () => {
    mockPing.mockRejectedValue(new Error("redis down"));

    const response = await GET(new Request("http://localhost/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.redis).toBe("error");
  });

  it("returns 200 when Redis not configured", async () => {
    mockGetRedisClient.mockReturnValue(null);

    const response = await GET(new Request("http://localhost/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redis).toBe("unconfigured");
    expect(body.status).toBe("ok");
  });

  it("response includes version and uptime", async () => {
    const response = await GET(new Request("http://localhost/api/health"));
    const body = await response.json();

    expect(body.version).toBe("0.1.0");
    expect(typeof body.uptime).toBe("number");
  });

  it("responds within 200ms", async () => {
    const startedAt = Date.now();
    await GET(new Request("http://localhost/api/health"));
    const duration = Date.now() - startedAt;

    expect(duration).toBeLessThan(200);
  });
});
