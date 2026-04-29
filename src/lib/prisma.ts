import { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";

function createPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
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
