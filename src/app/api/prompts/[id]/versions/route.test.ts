import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auth,
  checkRateLimit,
  rateLimitHeaders,
  createPromptVersion,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  checkRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
  createPromptVersion: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitHeaders,
}));

vi.mock("@/lib/prompt-data", () => ({
  createPromptVersion,
}));

import { POST } from "./route";

describe("POST /api/prompts/[id]/versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "engineer",
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

  it("POST returns 403 when role cannot edit prompts", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "viewer",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/prompts/template_1/versions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: "Updated content",
          commitMessage: "Tune prompt",
        }),
      }),
      {
        params: Promise.resolve({ id: "template_1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("engineers, admins, or owners");
  });

  it("POST creates new version with incremented number", async () => {
    createPromptVersion.mockResolvedValue({
      id: "version_4",
      version: "v4",
    });

    const response = await POST(
      new Request("http://localhost/api/prompts/template_1/versions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: "Updated content",
          commitMessage: "Tune prompt",
        }),
      }),
      {
        params: Promise.resolve({ id: "template_1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.version).toBe("v4");
  });

  it("POST returns 400 when content is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/prompts/template_1/versions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          commitMessage: "Tune prompt",
        }),
      }),
      {
        params: Promise.resolve({ id: "template_1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Content is required.");
  });

  it("POST returns 404 when template not found", async () => {
    createPromptVersion.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/prompts/template_1/versions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: "Updated content",
          commitMessage: "Tune prompt",
        }),
      }),
      {
        params: Promise.resolve({ id: "template_1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Prompt template not found.");
  });
});
