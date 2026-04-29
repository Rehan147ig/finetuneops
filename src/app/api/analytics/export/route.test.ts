import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auth,
  checkRateLimit,
  rateLimitHeaders,
  mockTraceFindMany,
  mockDatasetFindMany,
  mockTrainingJobFindMany,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  checkRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
  mockTraceFindMany: vi.fn(),
  mockDatasetFindMany: vi.fn(),
  mockTrainingJobFindMany: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitHeaders,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    traceEvent: {
      findMany: mockTraceFindMany,
    },
    dataset: {
      findMany: mockDatasetFindMany,
    },
    trainingJob: {
      findMany: mockTrainingJobFindMany,
    },
  },
}));

import { GET } from "./route";

describe("GET /api/analytics/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
      },
    });
    checkRateLimit.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      reset: 1234567890,
    });
    rateLimitHeaders.mockReturnValue({
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": "99",
      "X-RateLimit-Reset": "1234567890",
    });
  });

  it("returns 401 without session", async () => {
    auth.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/analytics/export?type=traces"));

    expect(response.status).toBe(401);
  });

  it("returns CSV with correct headers for traces", async () => {
    mockTraceFindMany.mockResolvedValue([
      {
        id: "trace_1",
        title: "Refund trace",
        modelName: "gpt-4o-mini",
        status: "triaged",
        severity: "medium",
        capturedAt: new Date("2026-04-24T10:00:00.000Z"),
        latencyMs: 120,
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/analytics/export?type=traces&range=30d"),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("finetuneops-traces-");
    expect(body).toContain("id,title,model,status,severity,capturedAt,latencyMs");
    expect(body).toContain("trace_1,Refund trace,gpt-4o-mini,triaged,medium");
  });

  it("returns CSV with correct headers for datasets", async () => {
    mockDatasetFindMany.mockResolvedValue([
      {
        id: "dataset_1",
        name: "Support set",
        version: "v1",
        rowCount: 45,
        qualityScore: 91,
        qualityReport: { healthScore: 92 },
        createdAt: new Date("2026-04-24T10:00:00.000Z"),
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/analytics/export?type=datasets&range=30d"),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("id,name,version,exampleCount,healthScore,createdAt");
    expect(body).toContain("dataset_1,Support set,v1,45,92");
  });

  it("returns CSV with correct headers for jobs", async () => {
    mockTrainingJobFindMany.mockResolvedValue([
      {
        id: "job_1",
        name: "Fine-tune April",
        modelBase: "gpt-4o-mini",
        status: "completed",
        trainedTokens: 12345,
        gpuHours: 2,
        finishedAt: new Date("2026-04-24T10:00:00.000Z"),
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/analytics/export?type=jobs&range=30d"),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("id,name,model,status,trainedTokens,estimatedCost,completedAt");
    expect(body).toContain("job_1,Fine-tune April,gpt-4o-mini,completed,12345");
  });

  it("returns 400 for unknown type", async () => {
    const response = await GET(
      new Request("http://localhost/api/analytics/export?type=unknown&range=30d"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Unknown export type.");
  });
});
