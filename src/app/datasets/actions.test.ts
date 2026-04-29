import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  requireAuthSession,
  enqueueBackgroundJob,
  recordActivityEvent,
  getDefaultUserId,
  revalidatePath,
} = vi.hoisted(() => ({
  mockPrisma: {
    dataset: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    datasetExample: {
      createMany: vi.fn(),
    },
  },
  requireAuthSession: vi.fn(),
  enqueueBackgroundJob: vi.fn(),
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

vi.mock("@/lib/auth-session", () => ({
  requireAuthSession,
}));

vi.mock("@/lib/background-jobs", () => ({
  enqueueBackgroundJob,
}));

vi.mock("@/lib/workspace-data", () => ({
  getDefaultUserId,
  recordActivityEvent,
}));

import { idleActionResult } from "@/lib/action-state";
import { removeFlaggedExamplesAction } from "./actions";

describe("removeFlaggedExamplesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthSession.mockResolvedValue({
      user: {
        organizationId: "org_1",
      },
    });
    getDefaultUserId.mockResolvedValue("user_1");
  });

  it("returns an error when cleanup removes nothing", async () => {
    mockPrisma.dataset.findFirst.mockResolvedValue({
      id: "dataset_1",
      projectId: "project_1",
      source: "seed",
      project: {
        datasets: [{ version: "v1" }],
      },
      examples: [
        { id: "ex_1", sourceTraceId: null, inputText: "clean input", outputText: "clean output", metadata: "{}" },
      ],
      qualityReport: {
        details: {
          duplicates: { pairs: [] },
          pii: { flagged: [] },
          length: { flagged: [] },
          emptyOutputs: { flagged: [] },
          language: { flagged: [] },
        },
      },
    });

    const formData = new FormData();
    formData.set("datasetId", "dataset_1");
    formData.set("mode", "pii");

    const result = await removeFlaggedExamplesAction(idleActionResult, formData);

    expect(result.status).toBe("error");
    expect(mockPrisma.dataset.create).not.toHaveBeenCalled();
  });

  it("creates a cleaned dataset version and enqueues rescoring", async () => {
    mockPrisma.dataset.findFirst.mockResolvedValue({
      id: "dataset_1",
      name: "Support Failures",
      projectId: "project_1",
      source: "seed",
      project: {
        datasets: [{ version: "v1" }, { version: "v2" }],
      },
      examples: [
        { id: "ex_1", sourceTraceId: "trace_1", inputText: "dup input", outputText: "a", metadata: "{}" },
        { id: "ex_2", sourceTraceId: "trace_2", inputText: "dup input", outputText: "a", metadata: "{}" },
        { id: "ex_3", sourceTraceId: "trace_3", inputText: "clean input", outputText: "clean output", metadata: "{}" },
      ],
      qualityReport: {
        details: {
          duplicates: {
            pairs: [{ leftId: "ex_1", rightId: "ex_2", type: "exact" }],
          },
          pii: { flagged: [] },
          length: { flagged: [] },
          emptyOutputs: { flagged: [] },
          language: { flagged: [] },
        },
      },
    });
    mockPrisma.dataset.create.mockResolvedValue({
      id: "dataset_2",
      name: "Support Failures",
      version: "v3",
    });

    const formData = new FormData();
    formData.set("datasetId", "dataset_1");
    formData.set("mode", "exact_duplicates");

    const result = await removeFlaggedExamplesAction(idleActionResult, formData);

    expect(result.status).toBe("success");
    expect(mockPrisma.dataset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: "v3",
          rowCount: 2,
        }),
      }),
    );
    expect(mockPrisma.datasetExample.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ inputText: "dup input" }),
          expect.objectContaining({ inputText: "clean input" }),
        ],
      }),
    );
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "dataset_created",
        projectId: "project_1",
      }),
    );
    expect(enqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        jobType: "score-dataset",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/datasets");
    expect(revalidatePath).toHaveBeenCalledWith("/datasets/dataset_1");
    expect(revalidatePath).toHaveBeenCalledWith("/datasets/dataset_2");
  });
});
