import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auth,
  processBackgroundJobById,
  mockPrisma,
  checkRateLimit,
  rateLimitHeaders,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  processBackgroundJobById: vi.fn(),
  mockPrisma: {
    backgroundJob: {
      findFirst: vi.fn(),
    },
  },
  checkRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/background-jobs", () => ({
  processBackgroundJobById,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitHeaders,
}));

import { POST } from "./route";

describe("POST /api/jobs/[id]/process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      reset: 1234567890,
    });
    rateLimitHeaders.mockReturnValue({
      "X-RateLimit-Limit": "10",
      "X-RateLimit-Remaining": "9",
      "X-RateLimit-Reset": "1234567890",
    });
  });

  it("requires authentication", async () => {
    auth.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/jobs/bg_1/process", { method: "POST" }), {
      params: Promise.resolve({ id: "bg_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toContain("Authentication required");
  });

  it("blocks non-manager roles", async () => {
    auth.mockResolvedValue({
      user: {
        organizationId: "org_1",
        role: "engineer",
      },
    });

    const response = await POST(new Request("http://localhost/api/jobs/bg_1/process", { method: "POST" }), {
      params: Promise.resolve({ id: "bg_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("workspace managers");
  });

  it("returns 404 when the job is not in the workspace", async () => {
    auth.mockResolvedValue({
      user: {
        organizationId: "org_1",
        role: "admin",
      },
    });
    mockPrisma.backgroundJob.findFirst.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/jobs/bg_1/process", { method: "POST" }), {
      params: Promise.resolve({ id: "bg_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("not found");
  });

  it("processes a queued background job for the workspace", async () => {
    auth.mockResolvedValue({
      user: {
        organizationId: "org_1",
        role: "owner",
      },
    });
    mockPrisma.backgroundJob.findFirst.mockResolvedValue({
      id: "bg_1",
      status: "queued",
    });

    const response = await POST(new Request("http://localhost/api/jobs/bg_1/process", { method: "POST" }), {
      params: Promise.resolve({ id: "bg_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(body).toEqual({
      id: "bg_1",
      status: "processed",
    });
    expect(processBackgroundJobById).toHaveBeenCalledWith("bg_1");
  });
});
