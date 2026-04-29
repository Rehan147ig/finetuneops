import { prisma } from "@/lib/prisma";
import { pingRedis } from "@/lib/redis";

export type HealthState = "ok" | "degraded" | "disabled";

export type ServiceHealthReport = {
  status: "ok" | "degraded";
  service: "finetuneops";
  timestamp: string;
  services: {
    database: {
      status: HealthState;
      message: string;
    };
    redis: {
      status: HealthState;
      message: string;
    };
  };
};

async function getDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: "ok" as const,
      message: "Database connection is healthy.",
    };
  } catch {
    return {
      status: "degraded" as const,
      message: "Database connection failed.",
    };
  }
}

async function getRedisHealth() {
  try {
    return await pingRedis();
  } catch {
    return {
      status: "degraded" as const,
      message: "Redis connection failed.",
    };
  }
}

export async function getServiceHealthReport(): Promise<ServiceHealthReport> {
  const [database, redis] = await Promise.all([getDatabaseHealth(), getRedisHealth()]);
  const status = database.status === "ok" && redis.status !== "degraded" ? "ok" : "degraded";

  return {
    status,
    service: "finetuneops",
    timestamp: new Date().toISOString(),
    services: {
      database,
      redis,
    },
  };
}
