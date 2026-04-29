import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, testSlackIntegration, logAuditEvent } = vi.hoisted(() => ({
  auth: vi.fn(),
  testSlackIntegration: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/slack", () => ({
  testSlackIntegration,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent,
}));

import { POST } from "./route";

describe("slack test route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin users", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "viewer",
      },
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("owners or admins");
  });

  it("returns 400 when Slack is not connected", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
      },
    });
    testSlackIntegration.mockResolvedValue({
      ok: false,
      error: "Slack is not connected for this workspace.",
    });

    const response = await POST();
    expect(response.status).toBe(400);
  });

  it("returns 200 when the Slack test succeeds", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
        email: "owner@example.com",
        name: "Owner",
      },
    });
    testSlackIntegration.mockResolvedValue({ ok: true });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "slack_integration_tested",
      }),
    );
  });
});
