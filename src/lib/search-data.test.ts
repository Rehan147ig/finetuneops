import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSearchDocumentCount,
  mockSearchDocumentFindMany,
  mockSearchDocumentFindFirst,
  mockSearchDocumentGroupBy,
  mockSearchDocumentUpsert,
  mockTraceFindMany,
  mockDatasetFindMany,
  mockPromptTemplateFindMany,
} = vi.hoisted(() => ({
  mockSearchDocumentCount: vi.fn(),
  mockSearchDocumentFindMany: vi.fn(),
  mockSearchDocumentFindFirst: vi.fn(),
  mockSearchDocumentGroupBy: vi.fn(),
  mockSearchDocumentUpsert: vi.fn(),
  mockTraceFindMany: vi.fn(),
  mockDatasetFindMany: vi.fn(),
  mockPromptTemplateFindMany: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  cached: vi.fn(async (_key, _ttl, fn: () => Promise<unknown>) => fn()),
  invalidatePattern: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    searchDocument: {
      count: mockSearchDocumentCount,
      findMany: mockSearchDocumentFindMany,
      findFirst: mockSearchDocumentFindFirst,
      groupBy: mockSearchDocumentGroupBy,
      upsert: mockSearchDocumentUpsert,
    },
    traceEvent: {
      findMany: mockTraceFindMany,
    },
    dataset: {
      findMany: mockDatasetFindMany,
    },
    promptTemplate: {
      findMany: mockPromptTemplateFindMany,
    },
  },
}));

import {
  cosineSimilarity,
  embedText,
  getSearchDocumentStats,
  searchDocs,
  searchWorkspace,
} from "@/lib/search-data";

describe("search data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchDocumentCount.mockResolvedValue(0);
    mockSearchDocumentFindFirst.mockResolvedValue({ updatedAt: new Date("2026-04-28T10:00:00.000Z") });
    mockSearchDocumentGroupBy.mockResolvedValue([]);
    mockSearchDocumentUpsert.mockResolvedValue(undefined);
    mockTraceFindMany.mockResolvedValue([]);
    mockDatasetFindMany.mockResolvedValue([]);
    mockPromptTemplateFindMany.mockResolvedValue([]);
  });

  it("embedText returns a normalized vector", () => {
    const vector = embedText("refund request customer support");

    expect(vector).toHaveLength(64);
    expect(vector.some((value) => value > 0)).toBe(true);
  });

  it("cosineSimilarity scores identical vectors highly", () => {
    const left = embedText("refund request");
    const right = embedText("refund request");

    expect(cosineSimilarity(left, right)).toBeGreaterThan(0.99);
  });

  it("searchDocs returns ranked public doc results", async () => {
    mockSearchDocumentFindMany.mockResolvedValue([
      {
        id: "doc_1",
        sourceType: "doc_page",
        sourceId: "sdk/overview",
        title: "SDK Overview",
        slug: "/docs/sdk/overview",
        content: "The SDK wraps OpenAI and batches traces.",
        embedding: embedText("SDK wraps OpenAI and batches traces"),
        metadata: { category: "SDK" },
        updatedAt: new Date(),
      },
      {
        id: "doc_2",
        sourceType: "doc_page",
        sourceId: "releases/gates",
        title: "Release Gates",
        slug: "/docs/releases/gates-and-approvals",
        content: "Approve releases only after quality and cost checks.",
        embedding: embedText("Approve releases only after quality and cost checks"),
        metadata: { category: "Releases" },
        updatedAt: new Date(),
      },
    ]);

    const results = await searchDocs("OpenAI SDK");

    expect(results[0]?.title).toBe("SDK Overview");
    expect(mockSearchDocumentUpsert).toHaveBeenCalled();
  });

  it("searchWorkspace includes public docs and workspace artifacts", async () => {
    mockSearchDocumentFindMany.mockResolvedValue([
      {
        id: "prompt_1",
        sourceType: "prompt_template",
        sourceId: "prompt_1",
        title: "customer-support",
        slug: "/prompts/prompt_1",
        content: "Handle refund requests with empathy.",
        embedding: embedText("Handle refund requests with empathy"),
        metadata: { currentVersion: "v2" },
        updatedAt: new Date(),
      },
      {
        id: "doc_1",
        sourceType: "doc_page",
        sourceId: "getting-started",
        title: "Getting Started",
        slug: "/docs/getting-started",
        content: "Capture failures before creating datasets.",
        embedding: embedText("Capture failures before creating datasets"),
        metadata: { category: "Getting Started" },
        updatedAt: new Date(),
      },
    ]);

    const results = await searchWorkspace("org_1", "refund empathy");

    expect(results.length).toBeGreaterThan(0);
    expect(mockTraceFindMany).toHaveBeenCalled();
    expect(mockDatasetFindMany).toHaveBeenCalled();
    expect(mockPromptTemplateFindMany).toHaveBeenCalled();
  });

  it("getSearchDocumentStats aggregates public and workspace counts", async () => {
    mockSearchDocumentCount
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5);
    mockSearchDocumentGroupBy
      .mockResolvedValueOnce([{ sourceType: "doc_page", _count: { sourceType: 3 } }])
      .mockResolvedValueOnce([{ sourceType: "prompt_template", _count: { sourceType: 5 } }]);

    const stats = await getSearchDocumentStats("org_1");

    expect(stats.publicDocuments).toBe(3);
    expect(stats.workspaceDocuments).toBe(5);
    expect(stats.bySourceType).toEqual([
      { sourceType: "prompt_template", count: 5 },
      { sourceType: "doc_page", count: 3 },
    ]);
  });

  it("searchDocs returns empty array for blank queries", async () => {
    const results = await searchDocs("   ");

    expect(results).toEqual([]);
    expect(mockSearchDocumentFindMany).not.toHaveBeenCalled();
  });
});
