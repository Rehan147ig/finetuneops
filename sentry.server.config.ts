import * as Sentry from "@sentry/nextjs";
import { getServerEnv } from "./src/lib/env";

// Runs once when the Node.js server process boots. Imported via instrumentation.ts.
// When SENTRY_DSN is empty (local dev, CI, or before the customer sets a DSN),
// Sentry stays inert — no network calls, no crashes, no telemetry.
export async function registerServerSentry() {
  const dsn = getServerEnv().SENTRY_DSN;

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? 0.1),
    ignoreErrors: [
      // Noise: client-side cancellations and expected API rejections.
      "AbortError",
      "NEXT_NOT_FOUND",
      "NEXT_REDIRECT",
    ],
    denyUrls: [
      // Don't report errors from third-party scripts/extensions.
      /extensions\//i,
      /^chrome-extension:/i,
    ],
  });
}
