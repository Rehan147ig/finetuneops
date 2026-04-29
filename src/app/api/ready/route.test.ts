import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockQueryRaw,
  mockHealthCheckCreate,
  mockHealthCheckDelete,
  mockGetRedisClient,
  mockPing,
  mockConnect,
} = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockHealthCheckCreate: vi.fn(),
  mockHealthCheckDelete: vi.fn(),
  mockGetRedisClient: vi.fn(),
  mockPing: vi.fn(),
  mockConnect: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
    healthCheck: {
      create: mockHealthCheckCreate,
      delete: mockHealthCheckDelete,
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

import { GET } from "./route";

describe("GET /api/ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockHealthCheckCreate.mockResolvedValue({ id: "health_1" });
    mockHealthCheckDelete.mockResolvedValue({ id: "health_1" });
    mockPing.mockResolvedValue("PONG");
    mockConnect.mockResolvedValue(undefined);
    mockGetRedisClient.mockReturnValue({
      status: "ready",
      ping: mockPing,
      connect: mockConnect,
    });
  });

  it("returns 200 and ready true when all checks pass", async () => {
    const response = await GET(new Request("http://localhost/api/ready"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ready: true,
      postgres: "ok",
      redis: "ok",
      dbWrite: "ok",
    });
  });

  it("returns 503 and ready false when db write fails", async () => {
    mockHealthCheckCreate.mockRejectedValue(new Error("write failed"));

    const response = await GET(new Request("http://localhost/api/ready"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ready).toBe(false);
    expect(body.dbWrite).toBe("error");
  });

  it("returns 503 when Postgres read fails", async () => {
    mockQueryRaw.mockRejectedValue(new Error("db read failed"));

    const response = await GET(new Request("http://localhost/api/ready"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ready).toBe(false);
    expect(body.postgres).toBe("error");
  });
});
