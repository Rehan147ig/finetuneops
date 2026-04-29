import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRawMock = vi.fn();
const pingRedisMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

vi.mock("@/lib/redis", () => ({
  pingRedis: pingRedisMock,
}));

describe("getServiceHealthReport", () => {
  beforeEach(() => {
    queryRawMock.mockReset();
    pingRedisMock.mockReset();
  });

  it("returns an ok report when database and redis are healthy", async () => {
    queryRawMock.mockResolvedValue([{ ok: 1 }]);
    pingRedisMock.mockResolvedValue({
      status: "ok",
      message: "PONG",
    });

    const { getServiceHealthReport } = await import("./service-health");
    const report = await getServiceHealthReport();

    expect(report.status).toBe("ok");
    expect(report.services.database.status).toBe("ok");
    expect(report.services.redis.status).toBe("ok");
  });

  it("returns a degraded report when the database query fails", async () => {
    queryRawMock.mockRejectedValue(new Error("db unavailable"));
    pingRedisMock.mockResolvedValue({
      status: "ok",
      message: "PONG",
    });

    const { getServiceHealthReport } = await import("./service-health");
    const report = await getServiceHealthReport();

    expect(report.status).toBe("degraded");
    expect(report.services.database.message).toBe("Database connection failed.");
  });

  it("keeps the service degraded when redis cannot be reached", async () => {
    queryRawMock.mockResolvedValue([{ ok: 1 }]);
    pingRedisMock.mockRejectedValue(new Error("redis unavailable"));

    const { getServiceHealthReport } = await import("./service-health");
    const report = await getServiceHealthReport();

    expect(report.status).toBe("degraded");
    expect(report.services.redis.message).toBe("Redis connection failed.");
  });
});
