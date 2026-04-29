import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, deactivateProviderCredential, logAuditEvent } = vi.hoisted(() => ({
  auth: vi.fn(),
  deactivateProviderCredential: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/provider-credentials", () => ({
  deactivateProviderCredential,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent,
}));

import { DELETE } from "./route";

describe("DELETE /api/settings/credentials/[id]", () => {
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

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "cred_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("owners or admins");
  });

  it("soft deletes a workspace credential", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "admin",
        email: "owner@example.com",
        name: "Owner",
      },
    });
    deactivateProviderCredential.mockResolvedValue({
      id: "cred_1",
    });

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "cred_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(deactivateProviderCredential).toHaveBeenCalledWith("cred_1", "org_1");
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider_credential_deactivated",
      }),
    );
  });
});
