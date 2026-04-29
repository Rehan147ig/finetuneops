import { describe, expect, it } from "vitest";
import {
  apiSecurityHeaders,
  contentSecurityPolicy,
  globalSecurityHeaders,
} from "@/lib/security-headers";

describe("security headers", () => {
  it("CSP header contains required directives", () => {
    expect(contentSecurityPolicy).toContain("default-src 'self'");
    expect(contentSecurityPolicy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(contentSecurityPolicy).toContain("connect-src 'self' *.sentry.io");
  });

  it("HSTS header has correct max-age", () => {
    const hsts = globalSecurityHeaders.find((header) => header.key === "Strict-Transport-Security");

    expect(hsts?.value).toContain("max-age=31536000");
    expect(hsts?.value).toContain("includeSubDomains");
  });

  it("X-Frame-Options is DENY", () => {
    const frameOptions = globalSecurityHeaders.find((header) => header.key === "X-Frame-Options");

    expect(frameOptions?.value).toBe("DENY");
  });

  it("API routes have no-store cache control", () => {
    const cacheControl = apiSecurityHeaders.find((header) => header.key === "Cache-Control");

    expect(cacheControl?.value).toBe("no-store");
  });
});
