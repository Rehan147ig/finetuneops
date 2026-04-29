import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  recordActivityEvent,
  getDefaultUserId,
  auth,
  authenticateWorkspaceApiKey,
  enforceTraceLimit,
  incrementTraceUsage,
  enqueueBackgroundJob,
  checkRateLimit,
  rateLimitHeaders,
  getQueueStats,
  shouldApplyBackpressure,
  loggerWarn,
} = vi.hoisted(() => ({
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

describe("POST /api/traces/ingest/batch", () => {
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
    incrementTraceUsage.mockResolvedValue(undefined);
    enqueueBackgroundJob.mockResolvedValue(undefined);
    recordActivityEvent.mockResolvedValue(undefined);
    checkRateLimit.mockResolvedValue({
      allowed: true,
      limit: 1000,
      remaining: 995,
      reset: 1234567890,
    });
    rateLimitHeaders.mockReturnValue({
      "X-RateLimit-Limit": "1000",
      "X-RateLimit-Remaining": "995",
      "X-RateLimit-Reset": "1234567890",
    });
    getQueueStats.mockResolvedValue([]);
    shouldApplyBackpressure.mockReturnValue(false);
    mockPrisma.project.findFirst.mockResolvedValue({ id: "project_1" });
    mockPrisma.traceEvent.create
      .mockResolvedValueOnce({
        id: "trace_1",
        title: "trace 1",
      })
      .mockResolvedValueOnce({
        id: "trace_2",
        title: "trace 2",
      });
    getDefaultUserId.mockResolvedValue("user_1");
  });

  it("accepts valid traces and reports rejected entries", async () => {
    const response = await POST(
      new Request("http://localhost/api/traces/ingest/batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "fto_test_key",
        },
        body: JSON.stringify({
          traces: [
            {
              input: "Customer asks for refund policy clarification after denied request.",
              output: "Refunds are processed within 5 to 7 business days after approval.",
              model: "gpt-4o-mini",
              latency_ms: 1840,
              metadata: { ticket_id: "T-1902" },
              tags: ["refund", "policy"],
            },
            {
              input: "short",
              output: "still short",
              model: "gpt",
              latency_ms: 10,
              metadata: {},
              tags: [],
            },
            {
              input: "Customer needs password reset instructions for the enterprise portal.",
              output: "Use the account recovery flow and verify email ownership before resetting.",
              model: "gpt-4o-mini",
              latency_ms: 420,
              metadata: { ticket_id: "T-1903" },
              tags: ["auth"],
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.accepted).toBe(2);
    expect(body.rejected).toBe(1);
    expect(body.errors).toEqual([
      {
        index: 1,
        error: "input must be at least 8 characters long.",
      },
    ]);
    expect(enqueueBackgroundJob).toHaveBeenCalledTimes(2);
    expect(incrementTraceUsage).toHaveBeenCalledTimes(2);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("1000");
  });

  it("rejects batches larger than 100 traces", async () => {
    const response = await POST(
      new Request("http://localhost/api/traces/ingest/batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          traces: new Array(101).fill({
            input: "Customer asks for refund policy clarification after denied request.",
            output: "Refunds are processed within 5 to 7 business days after approval.",
            model: "gpt-4o-mini",
            latency_ms: 1840,
            metadata: { ticket_id: "T-1902" },
            tags: ["refund", "policy"],
          }),
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("A batch can include at most 100 traces.");
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

    const response = await POST(
      new Request("http://localhost/api/traces/ingest/batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          traces: [],
        }),
      }),
    );

    expect(response.status).toBe(429);
  });

  it("returns 503 when queue backpressure is active", async () => {
    getQueueStats.mockResolvedValue([
      {
        name: "ingest-trace",
        waiting: 2500,
        active: 10,
        level: "critical",
      },
    ]);
    shouldApplyBackpressure.mockReturnValue(true);

    const response = await POST(
      new Request("http://localhost/api/traces/ingest/batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          traces: [],
        }),
      }),
    );
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
  });
});
