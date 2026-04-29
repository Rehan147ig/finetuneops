import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auth,
  connectSlackIntegration,
  removeSlackIntegration,
  checkRateLimit,
  rateLimitHeaders,
  logAuditEvent,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  connectSlackIntegration: vi.fn(),
  removeSlackIntegration: vi.fn(),
  checkRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/slack", () => ({
  connectSlackIntegration,
  removeSlackIntegration,
  isValidSlackWebhookUrl: (value: string) => value.startsWith("https://hooks.slack.com/"),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitHeaders,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent,
}));

import { DELETE, POST } from "./route";

describe("slack route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      reset: 1234567890,
    });
    rateLimitHeaders.mockReturnValue({
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": "99",
      "X-RateLimit-Reset": "1234567890",
    });
  });

  it("returns 403 for non-admin workspace members", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_2",
        organizationId: "org_1",
        role: "viewer",
      },
    });

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("owners or admins");
  });

  it("rejects invalid webhook URLs", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/settings/slack", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          webhookUrl: "https://example.com/not-slack",
          channel: "alerts",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("hooks.slack.com");
  });

  it("connects Slack and returns the saved integration", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
        email: "owner@example.com",
        name: "Owner",
      },
    });
    connectSlackIntegration.mockResolvedValue({
      id: "slack_1",
      channel: "#alerts",
      isActive: true,
    });

    const response = await POST(
      new Request("http://localhost/api/settings/slack", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          webhookUrl: "https://hooks.slack.com/services/test/webhook",
          channel: "alerts",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("100");
    expect(body.channel).toBe("#alerts");
    expect(connectSlackIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "org_1",
      }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "slack_integration_connected",
      }),
    );
  });

  it("deletes the current workspace Slack integration", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
        email: "owner@example.com",
        name: "Owner",
      },
    });

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(removeSlackIntegration).toHaveBeenCalledWith("org_1");
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "slack_integration_removed",
      }),
    );
  });
});
