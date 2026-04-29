import { getRedisClient } from "@/lib/redis";
import { logger } from "@/lib/logger";

export const CacheMetricKeys = {
  hits: "metrics:cache:hits",
  misses: "metrics:cache:misses",
};

export const CacheKeys = {
  workspacePlan: (orgId: string) => `cache:workspace:${orgId}:plan`,
  workspaceUsage: (orgId: string) => `cache:workspace:${orgId}:usage`,
  activityTimeline: (orgId: string) => `cache:workspace:${orgId}:activity`,
  nudges: (orgId: string) => `cache:workspace:${orgId}:nudges`,
  datasetQuality: (datasetId: string) => `cache:dataset:${datasetId}:quality`,
};

export const CacheTTL = {
  workspacePlan: 300,
  workspaceUsage: 60,
  activityTimeline: 30,
  nudges: 300,
  datasetQuality: 3600,
};

async function connectRedisIfNeeded(redis: ReturnType<typeof getRedisClient>) {
  if (redis && redis.status === "wait") {
    await redis.connect();
  }
}

async function incrementMetric(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  key: string,
) {
  try {
    await redis.incr(key);
  } catch (error) {
    logger.warn({
      event: "cache_error",
      key,
      error: error instanceof Error ? error.message : "Failed to increment cache metric",
    });
  }
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const redis = getRedisClient();

    if (!redis) {
      return await fn();
    }

    await connectRedisIfNeeded(redis);

    const cachedValue = await redis.get(key);

    if (cachedValue) {
      try {
        logger.info({ event: "cache_hit", key });
        await incrementMetric(redis, CacheMetricKeys.hits);
        return JSON.parse(cachedValue) as T;
      } catch (error) {
        logger.warn({
          event: "cache_error",
          key,
          error: error instanceof Error ? error.message : "Failed to parse cached JSON",
        });
        logger.info({ event: "cache_miss", key });
        await incrementMetric(redis, CacheMetricKeys.misses);
        return await fn();
      }
    }

    logger.info({ event: "cache_miss", key });
    await incrementMetric(redis, CacheMetricKeys.misses);
    const freshValue = await fn();
    await redis.set(key, JSON.stringify(freshValue), "EX", ttlSeconds);
    return freshValue;
  } catch (error) {
    logger.warn({
      event: "cache_error",
      key,
      error: error instanceof Error ? error.message : "unknown",
    });
    return await fn();
  }
}

export async function invalidate(key: string): Promise<void> {
  try {
    const redis = getRedisClient();

    if (!redis) {
      logger.warn({ event: "cache_error", key, error: "Redis unavailable for invalidate" });
      return;
    }

    await connectRedisIfNeeded(redis);
    await redis.del(key);
  } catch (error) {
    logger.warn({
      event: "cache_error",
      key,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function invalidatePattern(pattern: string): Promise<void> {
  try {
    const redis = getRedisClient();

    if (!redis) {
      logger.warn({ event: "cache_error", key: pattern, error: "Redis unavailable for invalidatePattern" });
      return;
    }

    await connectRedisIfNeeded(redis);

    let cursor = "0";

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    logger.warn({
      event: "cache_error",
      key: pattern,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
