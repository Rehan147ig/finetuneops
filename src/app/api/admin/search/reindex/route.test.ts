import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auth,
  checkRateLimit,
  rateLimitHeaders,
  reindexSearchDocuments,
  logAuditEvent,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  checkRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
  reindexSearchDocuments: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitHeaders,
}));

vi.mock("@/lib/search-data", () => ({
  reindexSearchDocuments,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent,
}));

import { POST } from "./route";

describe("POST /api/admin/search/reindex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      reset: 1234567890,
    });
    rateLimitHeaders.mockReturnValue({
      "X-RateLimit-Limit": "10",
      "X-RateLimit-Remaining": "9",
      "X-RateLimit-Reset": "1234567890",
    });
    reindexSearchDocuments.mockResolvedValue({
      publicDocuments: 6,
      workspaceDocuments: 12,
      bySourceType: [
        { sourceType: "doc_page", count: 6 },
        { sourceType: "prompt_template", count: 12 },
      ],
      lastIndexedAt: "2026-04-28T10:00:00.000Z",
    });
  });

  it("returns 401 without a session", async () => {
    auth.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "reviewer",
      },
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("owners or admins");
  });

  it("reindexes search and returns stats for admins", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
        email: "owner@example.com",
        name: "Owner",
      },
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspaceDocuments).toBe(12);
    expect(reindexSearchDocuments).toHaveBeenCalledWith("org_1");
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "search_index_reindexed",
      }),
    );
  });
});
