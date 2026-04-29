import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";
import { CacheMetricKeys } from "@/lib/cache";
import { logger } from "@/lib/logger";

export type PostgresStatus = "ok" | "error";
export type RedisStatus = "ok" | "error" | "unconfigured";
export type DbWriteStatus = "ok" | "error";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function connectRedisIfNeeded(redis: ReturnType<typeof getRedisClient>) {
  if (redis && redis.status === "wait") {
    await redis.connect();
  }
}

export async function checkPostgres(): Promise<PostgresStatus> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3000, "Postgres health check timed out");
    return "ok";
  } catch (error) {
    logger.warn({
      event: "health_postgres_check_failed",
      error: error instanceof Error ? error.message : "unknown",
    });
    return "error";
  }
}

export async function checkRedis(): Promise<RedisStatus> {
  const redis = getRedisClient();

  if (!redis) {
    return "unconfigured";
  }

  try {
    await connectRedisIfNeeded(redis);
    const pong = await withTimeout(redis.ping(), 2000, "Redis health check timed out");
    return pong === "PONG" ? "ok" : "error";
  } catch (error) {
    logger.warn({
      event: "health_redis_check_failed",
      error: error instanceof Error ? error.message : "unknown",
    });
    return "error";
  }
}

export async function checkDbWrite(): Promise<DbWriteStatus> {
  try {
    const record = await prisma.healthCheck.create({
      data: { checkedAt: new Date() },
    });
    await prisma.healthCheck.delete({
      where: { id: record.id },
    });
    return "ok";
  } catch (error) {
    logger.warn({
      event: "health_db_write_failed",
      error: error instanceof Error ? error.message : "unknown",
    });
    return "error";
  }
}

export async function getHealthSnapshot() {
  const [postgresResult, redisResult] = await Promise.allSettled([
    checkPostgres(),
    checkRedis(),
  ]);

  const postgres: PostgresStatus =
    postgresResult.status === "fulfilled" ? postgresResult.value : "error";
  const redis: RedisStatus =
    redisResult.status === "fulfilled" ? redisResult.value : "error";

  const status =
    postgres === "error" ? "down" : redis === "error" ? "degraded" : "ok";

  return {
    status,
    postgres,
    redis,
    version: process.env.npm_package_version ?? "unknown",
    uptime: process.uptime(),
  };
}

export async function getReadinessSnapshot() {
  const [postgresResult, redisResult, dbWriteResult] = await Promise.allSettled([
    checkPostgres(),
    checkRedis(),
    checkDbWrite(),
  ]);

  const postgres: PostgresStatus =
    postgresResult.status === "fulfilled" ? postgresResult.value : "error";
  const redis: RedisStatus =
    redisResult.status === "fulfilled" ? redisResult.value : "error";
  const dbWrite: DbWriteStatus =
    dbWriteResult.status === "fulfilled" ? dbWriteResult.value : "error";

  return {
    ready: postgres === "ok" && redis === "ok" && dbWrite === "ok",
    postgres,
    redis,
    dbWrite,
  };
}

export async function getCacheMetrics() {
  const redis = getRedisClient();

  if (!redis) {
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
    };
  }

  await connectRedisIfNeeded(redis);

  const [hitsRaw, missesRaw] = await Promise.all([
    redis.get(CacheMetricKeys.hits),
    redis.get(CacheMetricKeys.misses),
  ]);

  const hits = Number.parseInt(hitsRaw ?? "0", 10) || 0;
  const misses = Number.parseInt(missesRaw ?? "0", 10) || 0;
  const total = hits + misses;

  return {
    hits,
    misses,
    hitRate: total === 0 ? 0 : hits / total,
  };
}
