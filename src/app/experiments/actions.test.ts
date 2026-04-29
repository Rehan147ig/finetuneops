import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, recordActivityEvent, getDefaultUserId, revalidatePath, enqueueBackgroundJob } = vi.hoisted(() => ({
  mockPrisma: {
    dataset: {
      findUnique: vi.fn(),
    },
    experimentRun: {
      create: vi.fn(),
    },
  },
  recordActivityEvent: vi.fn(),
  getDefaultUserId: vi.fn(),
  revalidatePath: vi.fn(),
  enqueueBackgroundJob: vi.fn(),
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

vi.mock("@/lib/background-jobs", () => ({
  enqueueBackgroundJob,
}));

import { idleActionResult } from "@/lib/action-state";
import { createExperimentFromDatasetAction } from "./actions";

describe("createExperimentFromDatasetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when the dataset id is missing", async () => {
    const result = await createExperimentFromDatasetAction(
      idleActionResult,
      new FormData(),
    );

    expect(result.status).toBe("error");
  });

  it("returns a warning when the dataset quality is too low", async () => {
    mockPrisma.dataset.findUnique.mockResolvedValue({
      id: "dataset_1",
      projectId: "project_1",
      status: "ready",
      qualityScore: 62,
      version: "v1",
      name: "Weak dataset",
      rowCount: 120,
      project: {
        organizationId: "org_1",
        experiments: [],
      },
      experiments: [],
    });

    const formData = new FormData();
    formData.set("datasetId", "dataset_1");

    const result = await createExperimentFromDatasetAction(idleActionResult, formData);

    expect(result.status).toBe("warning");
    expect(result.message).toContain("quality");
  });

  it("returns success when an experiment starts", async () => {
    mockPrisma.dataset.findUnique.mockResolvedValue({
      id: "dataset_1",
      projectId: "project_1",
      status: "ready",
      qualityScore: 88,
      version: "v4",
      name: "Escalation Recovery",
      rowCount: 2400,
      project: {
        organizationId: "org_1",
        experiments: [{ promptVersion: "support-v1.8" }],
      },
      experiments: [],
    });
    mockPrisma.experimentRun.create.mockResolvedValue({
      id: "experiment_1",
      name: "Escalation Recovery candidate",
      candidateModel: "Llama 3.1 8B + retrieval",
    });
    getDefaultUserId.mockResolvedValue("user_1");

    const formData = new FormData();
    formData.set("datasetId", "dataset_1");

    const result = await createExperimentFromDatasetAction(idleActionResult, formData);

    expect(result).toMatchObject({
      status: "success",
      title: "Experiment started",
    });
    expect(recordActivityEvent).toHaveBeenCalledTimes(1);
    expect(enqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        jobType: "run-experiment",
      }),
    );
  });
});
