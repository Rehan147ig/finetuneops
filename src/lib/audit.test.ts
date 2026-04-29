import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockFindMany, invalidatePattern } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
  invalidatePattern: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditEvent: {
      create: mockCreate,
      findMany: mockFindMany,
    },
  },
}));

vi.mock("@/lib/cache", () => ({
  cached: vi.fn(async (_key, _ttl, fn: () => Promise<unknown>) => fn()),
  invalidatePattern,
}));

import { getAuditEvents, logAuditEvent } from "@/lib/audit";

describe("audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs an audit event and invalidates audit caches", async () => {
    mockCreate.mockResolvedValue({
      id: "audit_1",
    });

    await logAuditEvent({
      organizationId: "org_1",
      actorUserId: "user_1",
      action: "api_key_created",
      targetType: "api_key",
      targetName: "Production SDK key",
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          action: "api_key_created",
        }),
      }),
    );
    expect(invalidatePattern).toHaveBeenCalledWith("cache:audit:org_1:*");
  });

  it("returns normalized audit events", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "audit_1",
        actorName: "Owner",
        actorEmail: "owner@example.com",
        actorRole: "owner",
        action: "prompt_version_deployed",
        targetType: "prompt_version",
        targetId: "version_3",
        targetName: "Support Prompt v3",
        metadata: { environment: "production" },
        createdAt: new Date("2026-04-28T10:00:00.000Z"),
      },
    ]);

    const events = await getAuditEvents("org_1", 10);

    expect(events).toEqual([
      expect.objectContaining({
        actorName: "Owner",
        action: "prompt_version_deployed",
        createdAt: "2026-04-28T10:00:00.000Z",
      }),
    ]);
  });
});
