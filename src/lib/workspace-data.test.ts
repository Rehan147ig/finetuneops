import { describe, expect, it, vi } from "vitest";
import {
  parseActivityMetadata,
  sortActivityLogEntries,
  toActivityItem,
} from "./workspace-data";
import type { ActivityLogEntry } from "./types";

// workspace-data imports prisma at the module level; mock it so tests
// don't require a live PrismaClient / Prisma engine binary.
vi.mock("./prisma", () => ({
  prisma: {
    activityLog: { findMany: vi.fn(), create: vi.fn() },
    reviewLink: { findUnique: vi.fn() },
  },
}));

describe("sortActivityLogEntries", () => {
  it("orders newer events before older ones", () => {
    const entries: ActivityLogEntry[] = [
      {
        id: "older",
        type: "trace_captured",
        message: "Older event",
        timestamp: "2026-04-17T09:00:00.000Z",
        userId: "user_1",
        metadata: {},
      },
      {
        id: "newer",
        type: "fine_tune_launched",
        message: "Newer event",
        timestamp: "2026-04-18T09:00:00.000Z",
        userId: "user_1",
        metadata: {},
      },
    ];

    expect(sortActivityLogEntries(entries).map((item) => item.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});

describe("toActivityItem", () => {
  it("maps release approval events into release timeline items", () => {
    const item = toActivityItem({
      id: "release_1",
      type: "release_approved",
      message: "Release cleared review",
      timestamp: "2026-04-18T12:00:00.000Z",
      userId: "user_1",
      metadata: {
        channel: "production",
      },
    });

    expect(item.title).toBe("Release approved");
    expect(item.kind).toBe("release");
    expect(item.detail).toBe("Release cleared review");
  });
});

describe("parseActivityMetadata", () => {
  it("parses valid JSON metadata", () => {
    expect(parseActivityMetadata('{"rows":2400,"quality":91.2}')).toEqual({
      rows: 2400,
      quality: 91.2,
    });
  });

  it("returns an empty object when metadata is invalid", () => {
    expect(parseActivityMetadata("not-json")).toEqual({});
  });
});
