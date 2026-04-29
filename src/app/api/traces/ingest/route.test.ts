import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, recordActivityEvent, getDefaultUserId, auth, authenticateWorkspaceApiKey, enforceTraceLimit, incrementTraceUsage, enqueueBackgroundJob, checkRateLimit, rateLimitHeaders, getQueueStats, shouldApplyBackpressure, loggerWarn } =
  vi.hoisted(() => ({
  mockPrisma: {
    project: {
      findFirst: vi.fn(),
    },
    traceEvent: {
      create: vi.fn(),
    },
  },
  recordActivityEvent: vi.fn(),
  getDefaultUserId: vi.fn(),
  auth: vi.fn(),
  authenticateWorkspaceApiKey: vi.fn(),
  enforceTraceLimit: vi.fn(),
  incrementTraceUsage: vi.fn(),
  enqueueBackgroundJob: vi.fn(),
  checkRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
  getQueueStats: vi.fn(),
  shouldApplyBackpressure: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/api-keys", () => ({
  authenticateWorkspaceApiKey,
}));

vi.mock("@/lib/billing-data", () => ({
  enforceTraceLimit,
  incrementTraceUsage,
}));

vi.mock("@/lib/background-jobs", () => ({
  enqueueBackgroundJob,
}));

vi.mock("@/lib/workspace-data", () => ({
  recordActivityEvent,
  getDefaultUserId,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitHeaders,
}));

vi.mock("@/lib/queue-monitor", () => ({
  getQueueStats,
  shouldApplyBackpressure,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarn,
  },
}));

import { POST } from "./route";

describe("POST /api/traces/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({
      user: {
        organizationId: "org_1",
      },
    });
    authenticateWorkspaceApiKey.mockResolvedValue(null);
    enforceTraceLimit.mockResolvedValue({
      allowed: true,
    });
    checkRateLimit.mockResolvedValue({
      allowed: true,
      limit: 1000,
      remaining: 999,
      reset: 1234567890,
    });
    rateLimitHeaders.mockReturnValue({
      "X-RateLimit-Limit": "1000",
      "X-RateLimit-Remaining": "999",
      "X-RateLimit-Reset": "1234567890",
    });
    getQueueStats.mockResolvedValue([]);
    shouldApplyBackpressure.mockReturnValue(false);
  });

  it("rejects a bad payload with a clear error message", async () => {
    const request = new Request("http://localhost/api/traces/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: "short",
        output: "still short",
        model: "gpt",
        latency_ms: -4,
        metadata: {},
        tags: [],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("input");
  });

  it("captures a valid trace and returns the capture payload", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "project_1" });
    mockPrisma.traceEvent.create.mockResolvedValue({
      id: "trace_1",
      capturedAt: new Date("2026-04-20T12:00:00.000Z"),
      title: "Customer asks for refund policy clarification...",
    });
    getDefaultUserId.mockResolvedValue("user_1");

    const request = new Request("http://localhost/api/traces/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: "Customer asks for refund policy clarification after denied request.",
        output: "The assistant gave an incomplete answer without the relevant policy cite.",
        model: "gpt-4o-mini",
        latency_ms: 1840,
        metadata: {
          ticket_id: "T-1902",
        },
        tags: ["refund", "policy"],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      id: "trace_1",
      status: "captured",
      timestamp: "2026-04-20T12:00:00.000Z",
    });
    expect(response.headers.get("X-RateLimit-Limit")).toBe("1000");
    expect(recordActivityEvent).toHaveBeenCalledTimes(1);
    expect(incrementTraceUsage).toHaveBeenCalledWith("org_1");
    expect(enqueueBackgroundJob).toHaveBeenCalledTimes(2);
  });

  it("rejects unauthenticated requests without an API key", async () => {
    auth.mockResolvedValue(null);

    const request = new Request("http://localhost/api/traces/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: "Customer asks for refund policy clarification after denied request.",
        output: "The assistant gave an incomplete answer without the relevant policy cite.",
        model: "gpt-4o-mini",
        latency_ms: 1840,
        metadata: {
          ticket_id: "T-1902",
        },
        tags: ["refund", "policy"],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toContain("Authentication required");
  });

  it("blocks ingestion when the trace limit is reached", async () => {
    enforceTraceLimit.mockResolvedValue({
      allowed: false,
      reason: "Upgrade your plan to continue.",
    });

    const request = new Request("http://localhost/api/traces/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: "Customer asks for refund policy clarification after denied request.",
        output: "The assistant gave an incomplete answer without the relevant policy cite.",
        model: "gpt-4o-mini",
        latency_ms: 1840,
        metadata: {
          ticket_id: "T-1902",
        },
        tags: ["refund", "policy"],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toBe("Upgrade your plan to continue.");
  });

  it("returns 429 when the trace rate limit is exceeded", async () => {
    checkRateLimit.mockResolvedValue({
      allowed: false,
      limit: 1000,
      remaining: 0,
      reset: 1234567890,
    });
    rateLimitHeaders.mockReturnValue({
      "X-RateLimit-Limit": "1000",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "1234567890",
    });

    const request = new Request("http://localhost/api/traces/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: "Customer asks for refund policy clarification after denied request.",
        output: "The assistant gave an incomplete answer without the relevant policy cite.",
        model: "gpt-4o-mini",
        latency_ms: 1840,
        metadata: {
          ticket_id: "T-1902",
        },
        tags: ["refund", "policy"],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({
      error: "Trace rate limit exceeded",
      retryAfter: 60,
    });
    expect(response.headers.get("X-RateLimit-Limit")).toBe("1000");
  });

  it("returns 503 when queue backpressure is active", async () => {
    getQueueStats.mockResolvedValue([
      {
        name: "ingest-trace",
        waiting: 2500,
        active: 12,
        level: "critical",
      },
    ]);
    shouldApplyBackpressure.mockReturnValue(true);

    const response = await POST(new Request("http://localhost/api/traces/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: "Customer asks for refund policy clarification after denied request.",
        output: "The assistant gave an incomplete answer without the relevant policy cite.",
        model: "gpt-4o-mini",
        latency_ms: 1840,
        metadata: {
          ticket_id: "T-1902",
        },
        tags: ["refund", "policy"],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "System under high load. Retry in 30 seconds.",
      retryAfter: 30,
    });
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "backpressure_applied",
        organizationId: "org_1",
      }),
    );
    expect(enqueueBackgroundJob).not.toHaveBeenCalled();
  });

  it("returns 413 when content-length header exceeds 100KB", async () => {
    const response = await POST(new Request("http://localhost/api/traces/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "102401",
      },
      body: JSON.stringify({
        input: "Customer asks for refund policy clarification after denied request.",
        output: "The assistant gave an incomplete answer without the relevant policy cite.",
        model: "gpt-4o-mini",
        latency_ms: 1840,
        metadata: {
          ticket_id: "T-1902",
        },
        tags: ["refund", "policy"],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toBe("Request too large. Maximum size is 100KB.");
  });

  it("returns 413 when body exceeds 100KB after parsing", async () => {
    const largeText = "x".repeat(102401);

    const response = await POST(new Request("http://localhost/api/traces/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: largeText,
        output: "The assistant gave an incomplete answer without the relevant policy cite.",
        model: "gpt-4o-mini",
        latency_ms: 1840,
        metadata: {
          ticket_id: "T-1902",
        },
        tags: ["refund", "policy"],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toBe("Request too large. Maximum size is 100KB.");
  });
});
