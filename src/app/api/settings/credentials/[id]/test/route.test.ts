import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, testProviderCredential, logAuditEvent } = vi.hoisted(() => ({
  auth: vi.fn(),
  testProviderCredential: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/provider-credentials", () => ({
  testProviderCredential,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent,
}));

import { POST } from "./route";

describe("POST /api/settings/credentials/[id]/test", () => {
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

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "cred_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("owners or admins");
  });

  it("returns ok when the provider test passes", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
        email: "owner@example.com",
        name: "Owner",
      },
    });
    testProviderCredential.mockResolvedValue({ ok: true });

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "cred_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider_credential_tested",
      }),
    );
  });

  it("returns a safe error when the provider test fails", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
      },
    });
    testProviderCredential.mockResolvedValue({
      ok: false,
      error: "Invalid API key",
    });

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "cred_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: false,
      error: "Invalid API key",
    });
  });
});
