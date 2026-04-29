import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auth,
  createProviderCredential,
  listProviderCredentials,
  checkRateLimit,
  rateLimitHeaders,
  logAuditEvent,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  createProviderCredential: vi.fn(),
  listProviderCredentials: vi.fn(),
  checkRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/provider-credentials", () => ({
  createProviderCredential,
  listProviderCredentials,
  isProviderName: (value: string) => ["openai", "anthropic", "huggingface"].includes(value),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitHeaders,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent,
}));

import { GET, POST } from "./route";

describe("credentials route", () => {
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

  it("rejects unauthenticated requests", async () => {
    auth.mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns 403 for non-admin workspace members", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_2",
        organizationId: "org_1",
        role: "viewer",
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("owners or admins");
  });

  it("lists credentials without key material", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
      },
    });
    listProviderCredentials.mockResolvedValue([
      {
        id: "cred_1",
        provider: "openai",
        label: "Production key",
        isActive: true,
        lastTestedAt: null,
        lastTestOk: null,
        createdAt: new Date("2026-04-23T00:00:00.000Z"),
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("100");
    expect(body[0].encryptedKey).toBeUndefined();
    expect(body[0].iv).toBeUndefined();
  });

  it("creates a credential and never returns the key", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
        email: "owner@example.com",
        name: "Owner",
      },
    });
    createProviderCredential.mockResolvedValue({
      id: "cred_1",
      provider: "openai",
      label: "Production key",
      createdAt: new Date("2026-04-23T00:00:00.000Z"),
    });

    const response = await POST(
      new Request("http://localhost/api/settings/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider: "openai",
          label: "Production key",
          apiKey: "sk-live-123",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.apiKey).toBeUndefined();
    expect(createProviderCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "org_1",
      }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider_credential_created",
      }),
    );
  });

  it("rejects unsupported providers", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/settings/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider: "unknown",
          label: "Bad key",
          apiKey: "abc",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Provider must be one of");
  });

  it("returns 413 when body exceeds 10KB", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/settings/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider: "openai",
          label: "Production key",
          apiKey: "x".repeat(10_241),
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toBe("Request too large. Maximum size is 10KB.");
  });
});
