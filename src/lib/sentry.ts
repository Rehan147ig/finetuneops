import * as Sentry from "@sentry/nextjs";

let initialized = false;

export function initializeSentry() {
  if (initialized) {
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN || undefined,
    tracesSampleRate: 0,
    enabled: Boolean(process.env.SENTRY_DSN),
  });

  initialized = true;
}

export { Sentry };
