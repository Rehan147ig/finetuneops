import { logger } from "@/lib/logger";

type RequiredEnvVar = {
  key: string;
  help: string;
};

export type ServerEnv = {
  DATABASE_URL: string;
  NEXTAUTH_SECRET: string;
  NEXTAUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY: string;
  REDIS_URL: string;
  ENCRYPTION_KEY: string;
  RESEND_FROM_EMAIL: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  APP_URL: string;
  LOG_LEVEL: string;
  SENTRY_DSN: string;
  INTERNAL_SLACK_WEBHOOK: string;
  ADMIN_SECRET: string;
};

const buildTimeFallbackEnv: ServerEnv = {
  DATABASE_URL: "postgresql://build:build@127.0.0.1:5432/finetuneops?schema=public",
  NEXTAUTH_SECRET: "build-time-nextauth-secret",
  NEXTAUTH_URL: "http://127.0.0.1:3000",
  GOOGLE_CLIENT_ID: "build-google-client-id",
  GOOGLE_CLIENT_SECRET: "build-google-client-secret",
  GITHUB_CLIENT_ID: "build-github-client-id",
  GITHUB_CLIENT_SECRET: "build-github-client-secret",
  STRIPE_SECRET_KEY: "sk_test_build_placeholder",
  STRIPE_PUBLISHABLE_KEY: "pk_test_build_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_build_placeholder",
  RESEND_API_KEY: "re_build_placeholder",
  REDIS_URL: "redis://127.0.0.1:6379",
  ENCRYPTION_KEY: "12345678901234567890123456789012",
  RESEND_FROM_EMAIL: "FineTuneOps <build@example.com>",
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  APP_URL: "http://127.0.0.1:3000",
  LOG_LEVEL: "info",
  SENTRY_DSN: "",
  INTERNAL_SLACK_WEBHOOK: "",
  ADMIN_SECRET: "",
};

const requiredServerEnvVars: RequiredEnvVar[] = [
  { key: "DATABASE_URL", help: "Set your PostgreSQL connection string." },
  { key: "NEXTAUTH_SECRET", help: "Generate one with: https://authjs.dev/getting-started/deployment#auth_secret" },
  { key: "NEXTAUTH_URL", help: "Set this to your app URL, for example http://localhost:3000." },
  { key: "GOOGLE_CLIENT_ID", help: "Get this from the Google Cloud Console OAuth credentials page." },
  { key: "GOOGLE_CLIENT_SECRET", help: "Get this from the Google Cloud Console OAuth credentials page." },
  { key: "GITHUB_CLIENT_ID", help: "Get this from GitHub Developer Settings > OAuth Apps." },
  { key: "GITHUB_CLIENT_SECRET", help: "Get this from GitHub Developer Settings > OAuth Apps." },
  { key: "STRIPE_SECRET_KEY", help: "Get this from: https://dashboard.stripe.com/apikeys" },
  { key: "STRIPE_PUBLISHABLE_KEY", help: "Get this from: https://dashboard.stripe.com/apikeys" },
  { key: "STRIPE_WEBHOOK_SECRET", help: "Get this from: https://dashboard.stripe.com/webhooks" },
  { key: "RESEND_API_KEY", help: "Get this from: https://resend.com/api-keys" },
  { key: "REDIS_URL", help: "Point this at your Redis instance, for example redis://localhost:6379." },
  { key: "ENCRYPTION_KEY", help: "Use a 32-byte secret for encrypting provider credentials at rest." },
];

let cachedEnv: ServerEnv | null = null;

function isBuildPhase(source: NodeJS.ProcessEnv) {
  return (
    source === process.env &&
    (process.env.npm_lifecycle_event === "build" ||
      process.env.NEXT_PHASE === "phase-production-build")
  );
}

function requireNonEmptyValue(source: NodeJS.ProcessEnv, item: RequiredEnvVar) {
  const value = source[item.key];

  if (value && value.trim().length > 0) {
    return value;
  }

  if (isBuildPhase(source)) {
    logger.warn({
      event: "env_var_missing_build_fallback",
      key: item.key,
      lifecycleEvent: process.env.npm_lifecycle_event ?? "unknown",
      nextPhase: process.env.NEXT_PHASE ?? "unknown",
    });

    return buildTimeFallbackEnv[item.key as keyof ServerEnv];
  }

  throw new Error(`Missing required env var: ${item.key}. ${item.help}`);
}

export function validateServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const validated = Object.fromEntries(
    requiredServerEnvVars.map((item) => [item.key, requireNonEmptyValue(source, item)]),
  ) as Record<keyof ServerEnv, string>;

  return {
    DATABASE_URL: validated.DATABASE_URL,
    NEXTAUTH_SECRET: validated.NEXTAUTH_SECRET,
    NEXTAUTH_URL: validated.NEXTAUTH_URL,
    GOOGLE_CLIENT_ID: validated.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: validated.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: validated.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: validated.GITHUB_CLIENT_SECRET,
    STRIPE_SECRET_KEY: validated.STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY: validated.STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET: validated.STRIPE_WEBHOOK_SECRET,
    RESEND_API_KEY: validated.RESEND_API_KEY,
    REDIS_URL: validated.REDIS_URL,
    ENCRYPTION_KEY: validated.ENCRYPTION_KEY,
    RESEND_FROM_EMAIL: source.RESEND_FROM_EMAIL || "FineTuneOps <onboarding@example.com>",
    OPENAI_API_KEY: source.OPENAI_API_KEY || "",
    ANTHROPIC_API_KEY: source.ANTHROPIC_API_KEY || "",
    APP_URL: source.APP_URL || validated.NEXTAUTH_URL,
    LOG_LEVEL: source.LOG_LEVEL || "info",
    SENTRY_DSN: source.SENTRY_DSN || "",
    INTERNAL_SLACK_WEBHOOK: source.INTERNAL_SLACK_WEBHOOK || "",
    ADMIN_SECRET: source.ADMIN_SECRET || "",
  };
}

export function getServerEnv() {
  if (!cachedEnv) {
    cachedEnv = validateServerEnv();
  }

  return cachedEnv;
}

export function resetServerEnvCache() {
  cachedEnv = null;
}
