import { describe, expect, it } from "vitest";
import { validateServerEnv } from "@/lib/env";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/finetuneops?schema=public",
  NEXTAUTH_SECRET: "super-secret",
  NEXTAUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  STRIPE_SECRET_KEY: "sk_test_example",
  STRIPE_PUBLISHABLE_KEY: "pk_test_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  RESEND_API_KEY: "re_example",
  REDIS_URL: "redis://localhost:6379",
  ENCRYPTION_KEY: "12345678901234567890123456789012",
} as unknown as NodeJS.ProcessEnv;

describe("validateServerEnv", () => {
  it("throws a human-readable error when a required variable is missing", () => {
    expect(() =>
      validateServerEnv({
        ...validEnv,
        STRIPE_WEBHOOK_SECRET: "",
      }),
    ).toThrow(/Missing required env var: STRIPE_WEBHOOK_SECRET/);
  });

  it("falls back to build-safe placeholders during next build", () => {
    const previousLifecycleEvent = process.env.npm_lifecycle_event;
    const previousNextPhase = process.env.NEXT_PHASE;

    // The build-time fallback only fills MISSING vars and only when the source
    // is process.env. Clear the required vars first so this test is
    // deterministic regardless of the ambient environment (CI legitimately
    // sets DATABASE_URL et al., which previously made this test flaky/red).
    const requiredKeys = [
      "DATABASE_URL",
      "NEXTAUTH_SECRET",
      "NEXTAUTH_URL",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_PUBLISHABLE_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "RESEND_API_KEY",
      "REDIS_URL",
      "ENCRYPTION_KEY",
    ];
    const savedRequired: Record<string, string | undefined> = {};
    for (const key of requiredKeys) {
      savedRequired[key] = process.env[key];
      delete process.env[key];
    }

    process.env.npm_lifecycle_event = "build";
    process.env.NEXT_PHASE = "phase-production-build";

    try {
      const result = validateServerEnv(process.env);

      expect(result.DATABASE_URL).toBe("postgresql://build:build@127.0.0.1:5432/finetuneops?schema=public");
      expect(result.STRIPE_WEBHOOK_SECRET).toBe("whsec_build_placeholder");
    } finally {
      process.env.npm_lifecycle_event = previousLifecycleEvent;
      process.env.NEXT_PHASE = previousNextPhase;
      for (const key of requiredKeys) {
        if (savedRequired[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = savedRequired[key];
        }
      }
    }
  });
});
