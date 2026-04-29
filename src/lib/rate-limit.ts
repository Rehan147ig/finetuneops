import { getRedisClient } from "@/lib/redis";
import { logger } from "@/lib/logger";

export type RateLimitTier = "traces" | "api" | "admin";

const TIER_LIMITS: Record<RateLimitTier, number> = {
  traces: 1000,
  api: 100,
  admin: 10,
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

export async function checkRateLimit(
  organizationId: string,
  tier: RateLimitTier,
): Promise<RateLimitResult> {
  const limit = TIER_LIMITS[tier];
  const windowMs = 60_000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const reset = Math.floor((windowStart + windowMs) / 1000);
  const key = `ratelimit:${tier}:${organizationId}:${windowStart}`;

  try {
    const redis = getRedisClient();

    if (!redis) {
      return { allowed: true, limit, remaining: limit, reset };
    }

    if (redis.status === "wait") {
      await redis.connect();
    }

    const count = await redis.incr(key);

    if (count === 1) {
      await redis.pexpire(key, windowMs * 2);
    }

    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit;

    return { allowed, limit, remaining, reset };
  } catch (err) {
    logger.warn({
      event: "rate_limit_redis_unavailable",
      tier,
      organizationId,
      error: err instanceof Error ? err.message : "unknown",
    });
    return { allowed: true, limit, remaining: limit, reset };
  }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };
}
