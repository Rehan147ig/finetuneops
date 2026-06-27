import * as Sentry from "@sentry/nextjs";

// Runs in the browser. The DSN is exposed to the client via NEXT_PUBLIC_SENTRY_DSN.
// When it is empty (local dev, CI, or before a DSN is configured), Sentry stays
// inert — no network calls, no telemetry.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Browser replays are valuable for reproducing client-side regressions but
    // are bandwidth-heavy; keep the default low.
    replaysSessionSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE ?? 0.1,
    ),
    replaysOnErrorSampleRate: 1.0,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    ignoreErrors: [
      "AbortError",
      "NEXT_NOT_FOUND",
      "NEXT_REDIRECT",
    ],
  });
}
