import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = {
  ENCRYPTION_KEY: "finetuneops-encryption-key-for-tests",
};

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

import { decryptKey, encryptKey } from "@/lib/encryption";

describe("encryption", () => {
  beforeEach(() => {
    envState.ENCRYPTION_KEY = "finetuneops-encryption-key-for-tests";
  });

  it("encrypts and decrypts a key successfully", () => {
    const encrypted = encryptKey("sk-live-123");

    expect(decryptKey(encrypted.encrypted, encrypted.iv, encrypted.authTag)).toBe("sk-live-123");
  });

  it("throws when the encryption key changes before decrypt", () => {
    const encrypted = encryptKey("sk-live-123");
    envState.ENCRYPTION_KEY = "different-encryption-key";

    expect(() => decryptKey(encrypted.encrypted, encrypted.iv, encrypted.authTag)).toThrow();
  });

  it("throws when the ciphertext is tampered with", () => {
    const encrypted = encryptKey("sk-live-123");
    const tampered = `${encrypted.encrypted.slice(0, -2)}xx`;

    expect(() => decryptKey(tampered, encrypted.iv, encrypted.authTag)).toThrow();
  });
});
