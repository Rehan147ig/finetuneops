import Redis from "ioredis";
import { logger } from "@/lib/logger";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.REDIS_URL;

  if (!url) {
    logger.warn({ event: "redis_not_configured" });
    return null;
  }

  try {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    redisClient.on("error", (err) => {
      logger.warn({ event: "redis_connection_error", message: err.message });
    });
    return redisClient;
  } catch {
    logger.warn({ event: "redis_client_init_failed" });
    return null;
  }
}

export async function pingRedis() {
  const client = getRedisClient();

  if (!client) {
    return {
      status: "disabled" as const,
      message: "REDIS_URL is not configured.",
    };
  }

  if (client.status === "wait") {
    await client.connect();
  }

  const response = await client.ping();

  return {
    status: response === "PONG" ? ("ok" as const) : ("degraded" as const),
    message: response,
  };
}
