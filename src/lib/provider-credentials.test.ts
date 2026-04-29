import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = {
  ENCRYPTION_KEY: "provider-credential-test-key",
};

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    providerCredential: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/finetuneops?schema=public",
    NEXTAUTH_SECRET: "secret",
    NEXTAUTH_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "google",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GITHUB_CLIENT_ID: "github",
    GITHUB_CLIENT_SECRET: "github-secret",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_PUBLISHABLE_KEY: "pk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "FineTuneOps <test@example.com>",
    REDIS_URL: "redis://localhost:6379",
    ENCRYPTION_KEY: envState.ENCRYPTION_KEY,
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    APP_URL: "http://localhost:3000",
  }),
}));

import {
  createProviderCredential,
  deactivateProviderCredential,
  getActiveCredential,
  listProviderCredentials,
  testProviderCredential,
} from "@/lib/provider-credentials";

describe("provider credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.ENCRYPTION_KEY = "provider-credential-test-key";
  });

  it("lists only active credentials for the current workspace", async () => {
    mockPrisma.providerCredential.findMany.mockResolvedValue([
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

    const credentials = await listProviderCredentials("org_a");

    expect(mockPrisma.providerCredential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "org_a",
          isActive: true,
        },
      }),
    );
    expect(credentials).toHaveLength(1);
  });

  it("creates a credential without storing plaintext", async () => {
    mockPrisma.providerCredential.create.mockImplementation(async ({ data }) => ({
      id: "cred_1",
      provider: data.provider,
      label: data.label,
      createdAt: new Date("2026-04-23T00:00:00.000Z"),
    }));

    const credential = await createProviderCredential({
      workspaceId: "org_a",
      provider: "openai",
      label: "Production key",
      apiKey: "sk-live-123",
      createdBy: "user_1",
    });

    const call = mockPrisma.providerCredential.create.mock.calls[0][0];

    expect(call.data.encryptedKey).not.toBe("sk-live-123");
    expect(call.data.iv).toBeTruthy();
    expect(call.data.authTag).toBeTruthy();
    expect(credential).toEqual({
      id: "cred_1",
      provider: "openai",
      label: "Production key",
      createdAt: new Date("2026-04-23T00:00:00.000Z"),
    });
  });

  it("soft deletes a credential only inside the current workspace", async () => {
    mockPrisma.providerCredential.findFirst.mockResolvedValue({
      id: "cred_1",
      workspaceId: "org_a",
      isActive: true,
    });
    mockPrisma.providerCredential.update.mockResolvedValue({
      id: "cred_1",
    });

    await deactivateProviderCredential("cred_1", "org_a");

    expect(mockPrisma.providerCredential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "cred_1",
          workspaceId: "org_a",
          isActive: true,
        },
      }),
    );
  });

  it("returns a decrypted active credential for the right workspace", async () => {
    mockPrisma.providerCredential.create.mockImplementation(async ({ data }) => ({
      id: "cred_1",
      ...data,
    }));
    const created = await createProviderCredential({
      workspaceId: "org_a",
      provider: "openai",
      label: "Production key",
      apiKey: "sk-live-123",
      createdBy: "user_1",
    });

    mockPrisma.providerCredential.findFirst.mockResolvedValue({
      id: created.id,
      workspaceId: "org_a",
      provider: "openai",
      isActive: true,
      encryptedKey: mockPrisma.providerCredential.create.mock.calls[0][0].data.encryptedKey,
      iv: mockPrisma.providerCredential.create.mock.calls[0][0].data.iv,
      authTag: mockPrisma.providerCredential.create.mock.calls[0][0].data.authTag,
      createdAt: new Date(),
    });

    const decrypted = await getActiveCredential("org_a", "openai");

    expect(decrypted).toBe("sk-live-123");
  });

  it("returns null when no active credential exists", async () => {
    mockPrisma.providerCredential.findFirst.mockResolvedValue(null);

    await expect(getActiveCredential("org_a", "anthropic")).resolves.toBeNull();
  });

  it("does not leak workspace A credentials into workspace B", async () => {
    mockPrisma.providerCredential.findFirst.mockResolvedValue(null);

    const decrypted = await getActiveCredential("org_b", "openai");

    expect(mockPrisma.providerCredential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "org_b",
        }),
      }),
    );
    expect(decrypted).toBeNull();
  });

  it("tests a credential and marks it healthy when the provider accepts it", async () => {
    mockPrisma.providerCredential.create.mockImplementation(async ({ data }) => ({
      id: "cred_1",
      ...data,
    }));
    await createProviderCredential({
      workspaceId: "org_a",
      provider: "openai",
      label: "Production key",
      apiKey: "sk-live-123",
      createdBy: "user_1",
    });

    mockPrisma.providerCredential.findFirst.mockResolvedValue({
      id: "cred_1",
      workspaceId: "org_a",
      provider: "openai",
      isActive: true,
      encryptedKey: mockPrisma.providerCredential.create.mock.calls[0][0].data.encryptedKey,
      iv: mockPrisma.providerCredential.create.mock.calls[0][0].data.iv,
      authTag: mockPrisma.providerCredential.create.mock.calls[0][0].data.authTag,
    });
    mockPrisma.providerCredential.update.mockResolvedValue({
      id: "cred_1",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
      }),
    );

    const result = await testProviderCredential("cred_1", "org_a");

    expect(result).toEqual({ ok: true });
    expect(mockPrisma.providerCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cred_1" },
        data: expect.objectContaining({
          lastTestOk: true,
        }),
      }),
    );
  });
});
