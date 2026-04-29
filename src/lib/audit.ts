import { cached, invalidatePattern } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const AuditCacheTTL = 30;

const AuditCacheKeys = {
  latest: (organizationId: string, limit: number) =>
    `cache:audit:${organizationId}:latest:${limit}`,
  all: (organizationId: string) => `cache:audit:${organizationId}:*`,
} as const;

export type AuditMetadata = Record<string, string | number | boolean | null | undefined>;

export type AuditEventRecord = {
  id: string;
  actorName: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  metadata: AuditMetadata;
  createdAt: string;
};

export type AuditEventInput = {
  organizationId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetName?: string | null;
  metadata?: AuditMetadata;
};

function parseAuditMetadata(value: unknown): AuditMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as AuditMetadata;
}

function normalizeAuditEvent(event: {
  id: string;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  metadata: unknown;
  createdAt: Date;
}) {
  return {
    id: event.id,
    actorName: event.actorName ?? "Unknown actor",
    actorEmail: event.actorEmail,
    actorRole: event.actorRole,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    targetName: event.targetName,
    metadata: parseAuditMetadata(event.metadata),
    createdAt: event.createdAt.toISOString(),
  } satisfies AuditEventRecord;
}

export async function invalidateAuditEvents(organizationId: string) {
  await invalidatePattern(AuditCacheKeys.all(organizationId));
}

export async function logAuditEvent(input: AuditEventInput) {
  try {
    const event = await prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail ?? null,
        actorName: input.actorName ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        targetName: input.targetName ?? null,
        metadata: input.metadata ?? {},
      },
    });

    await invalidateAuditEvents(input.organizationId);
    return event;
  } catch (error) {
    logger.warn({
      event: "audit_log_failed",
      organizationId: input.organizationId,
      action: input.action,
      targetType: input.targetType,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export async function getAuditEvents(organizationId: string, limit = 50) {
  return cached(AuditCacheKeys.latest(organizationId, limit), AuditCacheTTL, async () => {
    try {
      const events = await prisma.auditEvent.findMany({
        where: {
          organizationId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: Math.min(Math.max(limit, 1), 200),
      });

      return events.map(normalizeAuditEvent);
    } catch (error) {
      logger.warn({
        event: "audit_query_failed",
        organizationId,
        error: error instanceof Error ? error.message : "unknown",
      });
      return [] as AuditEventRecord[];
    }
  });
}
