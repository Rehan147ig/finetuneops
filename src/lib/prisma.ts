import { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";

const BUILD_TIME_DATABASE_URL =
  "postgresql://build:build@127.0.0.1:5432/finetuneops?schema=public";

function resolveDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    return databaseUrl;
  }

  logger.warn({
    event: "database_url_missing",
    fallback: "placeholder_url",
    lifecycleEvent: process.env.npm_lifecycle_event ?? "unknown",
    nextPhase: process.env.NEXT_PHASE ?? "unknown",
  });
  return BUILD_TIME_DATABASE_URL;
}

function createPrismaClient() {
  const databaseUrl = resolveDatabaseUrl();

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: [
      {
        emit: "event",
        level: "query",
      },
      {
        emit: "stdout",
        level: "error",
      },
    ],
  });
}

type PrismaClientWithQueryEvents = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientWithQueryEvents | undefined;
};

function inferModelAndOperation(query: string) {
  const normalized = query.replace(/\s+/g, " ").trim();
  const operation = normalized.split(" ")[0]?.toLowerCase() ?? "unknown";
  const modelMatch =
    normalized.match(/\bfrom\s+"?([a-zA-Z0-9_]+)"?/i) ??
    normalized.match(/\binto\s+"?([a-zA-Z0-9_]+)"?/i) ??
    normalized.match(/\bupdate\s+"?([a-zA-Z0-9_]+)"?/i);

  return {
    model: modelMatch?.[1] ?? "unknown",
    operation,
  };
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

prisma.$on("query", (event) => {
  if (event.duration <= 100) {
    return;
  }

  const details = inferModelAndOperation(event.query);
  logger.warn({
    event: "slow_query",
    duration: event.duration,
    model: details.model,
    operation: details.operation,
  });
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
