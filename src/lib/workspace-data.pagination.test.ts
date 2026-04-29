import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockProjectFindFirst, mockTraceFindMany } = vi.hoisted(() => ({
  mockProjectFindFirst: vi.fn(),
  mockTraceFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: mockProjectFindFirst,
    },
    traceEvent: {
      findMany: mockTraceFindMany,
    },
    activityLog: {
      create: vi.fn(),
    },
  },
}));

import { getTracePage } from "./workspace-data";

function createTrace(id: string, createdAt: string) {
  return {
    id,
    title: `Trace ${id}`,
    source: "SDK",
    status: "triaged",
    severity: "medium",
    spanCount: 2,
    opportunityScore: 0.72,
    capturedAt: new Date(createdAt),
    convertedDatasetId: null,
  };
}

describe("getTracePage", () => {
  beforeEach(() => {
    mockProjectFindFirst.mockReset();
    mockTraceFindMany.mockReset();
    mockProjectFindFirst.mockResolvedValue({ id: "project_1" });
  });

  it("returns cursor pagination results in descending order", async () => {
    mockTraceFindMany.mockResolvedValue([
      createTrace("trace_3", "2026-04-24T12:00:00.000Z"),
      createTrace("trace_2", "2026-04-24T11:00:00.000Z"),
      createTrace("trace_1", "2026-04-24T10:00:00.000Z"),
    ]);

    const result = await getTracePage(
      { organizationId: "org_1" },
      { limit: 2 },
    );

    expect(result.traces.map((trace) => trace.id)).toEqual(["trace_3", "trace_2"]);
    expect(result.nextCursor).toBe("trace_2");
    expect(mockTraceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        skip: 0,
        cursor: undefined,
      }),
    );
  });

  it("returns null when there are no more traces to load", async () => {
    mockTraceFindMany.mockResolvedValue([
      createTrace("trace_2", "2026-04-24T11:00:00.000Z"),
      createTrace("trace_1", "2026-04-24T10:00:00.000Z"),
    ]);

    const result = await getTracePage(
      { organizationId: "org_1" },
      { limit: 2 },
    );

    expect(result.traces).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it("starts the next page after the provided cursor", async () => {
    mockTraceFindMany.mockResolvedValue([
      createTrace("trace_1", "2026-04-24T10:00:00.000Z"),
    ]);

    const result = await getTracePage(
      { organizationId: "org_1" },
      { cursor: "trace_2", limit: 2 },
    );

    expect(result.traces.map((trace) => trace.id)).toEqual(["trace_1"]);
    expect(result.nextCursor).toBeNull();
    expect(mockTraceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "trace_2" },
        skip: 1,
      }),
    );
  });
});
