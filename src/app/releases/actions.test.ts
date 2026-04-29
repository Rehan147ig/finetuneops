import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, recordActivityEvent, getDefaultUserId, revalidatePath } = vi.hoisted(() => ({
  mockPrisma: {
    modelRelease: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    reviewLink: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  recordActivityEvent: vi.fn(),
  getDefaultUserId: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/workspace-data", () => ({
  recordActivityEvent,
  getDefaultUserId,
}));

import { idleActionResult } from "@/lib/action-state";
import { advanceReleaseAction, createReviewLinkAction, decideReviewLinkAction } from "./actions";

describe("advanceReleaseAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when the release id is missing", async () => {
    const result = await advanceReleaseAction(idleActionResult, new FormData());

    expect(result.status).toBe("error");
  });

  it("returns a warning when the release cannot advance", async () => {
    mockPrisma.modelRelease.findUnique.mockResolvedValue({
      id: "release_1",
      projectId: "project_1",
      status: "approved",
      qualityGate: "Pass",
      latencyGate: "Watch",
      costGate: "Pass",
    });

    const formData = new FormData();
    formData.set("releaseId", "release_1");

    const result = await advanceReleaseAction(idleActionResult, formData);

    expect(result.status).toBe("warning");
    expect(result.message).toContain("Latency");
  });

  it("returns success when a release is approved", async () => {
    mockPrisma.modelRelease.findUnique.mockResolvedValue({
      id: "release_1",
      projectId: "project_1",
      name: "Support Specialist v2.4",
      channel: "Staging",
      status: "gated",
      qualityGate: "Pass",
      latencyGate: "Pass",
      costGate: "Watch",
    });
    mockPrisma.modelRelease.update.mockResolvedValue({
      id: "release_1",
      name: "Support Specialist v2.4",
      channel: "Staging",
    });
    getDefaultUserId.mockResolvedValue("user_1");

    const formData = new FormData();
    formData.set("releaseId", "release_1");

    const result = await advanceReleaseAction(idleActionResult, formData);

    expect(result).toMatchObject({
      status: "success",
      title: "Release approved",
    });
    expect(recordActivityEvent).toHaveBeenCalledTimes(1);
  });
});

describe("createReviewLinkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success when a public review link is created", async () => {
    mockPrisma.modelRelease.findUnique.mockResolvedValue({
      id: "release_1",
      reviewLinks: [],
    });
    mockPrisma.reviewLink.create.mockResolvedValue({
      token: "token_1",
      expiresAt: new Date("2026-04-27T00:00:00.000Z"),
    });

    const formData = new FormData();
    formData.set("releaseId", "release_1");

    const result = await createReviewLinkAction(idleActionResult, formData);

    expect(result.status).toBe("success");
    expect(result.title).toBe("Review link created");
  });
});

describe("decideReviewLinkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records an approval decision", async () => {
    mockPrisma.reviewLink.findUnique.mockResolvedValue({
      id: "review_1",
      releaseId: "release_1",
      expiresAt: new Date("2026-05-27T00:00:00.000Z"),
      decidedAt: null,
      release: {
        projectId: "project_1",
        name: "Support Specialist v2.4",
      },
    });
    mockPrisma.reviewLink.update.mockResolvedValue({});
    mockPrisma.modelRelease.update.mockResolvedValue({});

    const formData = new FormData();
    formData.set("token", "token_1");
    formData.set("decision", "approved");
    formData.set("reviewerName", "Nadia");
    formData.set("approverNotes", "Looks ready");

    const result = await decideReviewLinkAction(idleActionResult, formData);

    expect(result).toMatchObject({
      status: "success",
      title: "Release approved",
    });
    expect(recordActivityEvent).toHaveBeenCalledTimes(1);
  });
});
