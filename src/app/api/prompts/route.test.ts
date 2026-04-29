import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auth,
  authenticateWorkspaceApiKey,
  checkRateLimit,
  rateLimitHeaders,
  getPromptTemplates,
  createPromptTemplate,
  mockProjectFindFirst,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  authenticateWorkspaceApiKey: vi.fn(),
  checkRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
  getPromptTemplates: vi.fn(),
  createPromptTemplate: vi.fn(),
  mockProjectFindFirst: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/api-keys", () => ({
  authenticateWorkspaceApiKey,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  rateLimitHeaders,
}));

vi.mock("@/lib/prompt-data", () => ({
  getPromptTemplates,
  createPromptTemplate,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: mockProjectFindFirst,
    },
  },
}));

import { GET, POST } from "./route";

describe("GET/POST /api/prompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "engineer",
      },
    });
    authenticateWorkspaceApiKey.mockResolvedValue(null);
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
    mockProjectFindFirst.mockResolvedValue({ id: "project_1" });
  });

  it("GET returns 401 without session", async () => {
    auth.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/prompts"));

    expect(response.status).toBe(401);
  });

  it("GET returns templates for authenticated user", async () => {
    getPromptTemplates.mockResolvedValue([
      {
        id: "template_1",
        name: "customer-support",
      },
    ]);

    const response = await GET(new Request("http://localhost/api/prompts"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([
      {
        id: "template_1",
        name: "customer-support",
      },
    ]);
  });

  it("POST returns 403 for viewers", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
        role: "viewer",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/prompts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "customer-support",
          description: "Support prompt",
          content: "Hello {{name}}",
          commitMessage: "Initial version",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("engineers, admins, or owners");
  });

  it("POST creates template with first version", async () => {
    createPromptTemplate.mockResolvedValue({
      id: "template_1",
      name: "customer-support",
      currentVersionId: "version_1",
    });

    const response = await POST(
      new Request("http://localhost/api/prompts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "customer-support",
          description: "Support prompt",
          content: "Hello {{name}}",
          commitMessage: "Initial version",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.currentVersionId).toBe("version_1");
    expect(createPromptTemplate).toHaveBeenCalledWith(
      "org_1",
      expect.objectContaining({
        name: "customer-support",
        content: "Hello {{name}}",
      }),
    );
  });

  it("POST returns 400 when name is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/prompts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: "Hello",
          commitMessage: "Initial version",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Name is required.");
  });

  it("POST returns 400 when content is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/prompts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "customer-support",
          commitMessage: "Initial version",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Content is required.");
  });
});
