import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auth,
  authenticateWorkspaceApiKey,
  searchDocs,
  searchWorkspace,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  authenticateWorkspaceApiKey: vi.fn(),
  searchDocs: vi.fn(),
  searchWorkspace: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/api-keys", () => ({
  authenticateWorkspaceApiKey,
}));

vi.mock("@/lib/search-data", () => ({
  searchDocs,
  searchWorkspace,
}));

import { GET } from "./route";

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchDocs.mockResolvedValue([
      {
        id: "doc_1",
        title: "SDK Overview",
      },
    ]);
    searchWorkspace.mockResolvedValue([
      {
        id: "prompt_1",
        title: "customer-support",
      },
    ]);
  });

  it("returns docs search results without authentication", async () => {
    const response = await GET(
      new Request("http://localhost/api/search?q=sdk&scope=docs"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results[0].title).toBe("SDK Overview");
    expect(searchDocs).toHaveBeenCalledWith("sdk");
  });

  it("returns 401 for workspace search without authentication", async () => {
    auth.mockResolvedValue(null);
    authenticateWorkspaceApiKey.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/search?q=refund&scope=workspace"),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toContain("Authentication required");
  });

  it("returns workspace search results for authenticated users", async () => {
    auth.mockResolvedValue({
      user: {
        organizationId: "org_1",
      },
    });

    const response = await GET(
      new Request("http://localhost/api/search?q=refund&scope=workspace"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results[0].title).toBe("customer-support");
    expect(searchWorkspace).toHaveBeenCalledWith("org_1", "refund");
  });
});
