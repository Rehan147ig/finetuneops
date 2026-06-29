import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  "font-src 'self' fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' *.sentry.io",
].join("; ");

const globalSecurityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const apiSecurityHeaders = [
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  compress: true,
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [...globalSecurityHeaders],
      },
      {
        source: "/api/(.*)",
        headers: [...apiSecurityHeaders],
      },
    ];
  },
};

// Sentry build-time options. authToken/org/project are optional at build time —
// when absent (local dev, CI) source-map upload is skipped and the build simply
// bundles the Sentry SDK for runtime use. Set them in CI/deploy to enable
// automatic source-map upload for readable stack traces.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only enable silent logging so the build is never noisy when Sentry is inert.
  silent: true,
  // Disable the automatic source map upload unless a token is present, so the
  // build never fails in environments without Sentry credentials.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
