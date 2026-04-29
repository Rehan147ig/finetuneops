import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auth,
  checkRateLimit,
  rateLimitHeaders,
  deployPromptVersion,
  mockPromptVersionFindFirst,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  checkRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
  deployPromptVersion: vi.fn(),
  mockPromptVersionFindFirst: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitHeaders,
}));

vi.mock("@/lib/prompt-data", () => ({
  deployPromptVersion,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    promptVersion: {
      findFirst: mockPromptVersionFindFirst,
    },
  },
}));

import { POST } from "./route";

describe("POST /api/prompts/[id]/versions/[versionId]/deploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "reviewer",
      },
    });
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
    mockPromptVersionFindFirst.mockResolvedValue({
      id: "version_3",
    });
  });

  it("returns 403 for engineers", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "engineer",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/prompts/template_1/versions/version_3/deploy", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          environment: "production",
        }),
      }),
      {
        params: Promise.resolve({ id: "template_1", versionId: "version_3" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("reviewers, admins, or owners");
  });

  it("deploys a prompt version for reviewers", async () => {
    deployPromptVersion.mockResolvedValue({
      id: "version_3",
      environment: "production",
    });

    const response = await POST(
      new Request("http://localhost/api/prompts/template_1/versions/version_3/deploy", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          environment: "production",
        }),
      }),
      {
        params: Promise.resolve({ id: "template_1", versionId: "version_3" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.environment).toBe("production");
  });
});
