import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, recordActivityEvent, getDefaultUserId, revalidatePath, enforceFineTuneLimit, incrementFineTuneUsage, requireWorkspaceManager, retryBackgroundJob, enqueueBackgroundJob, processBackgroundJobById } = vi.hoisted(() => ({
  mockPrisma: {
    experimentRun: {
      findUnique: vi.fn(),
    },
    trainingJob: {
      create: vi.fn(),
    },
    backgroundJob: {
      findFirst: vi.fn(),
    },
  },
  recordActivityEvent: vi.fn(),
  getDefaultUserId: vi.fn(),
  revalidatePath: vi.fn(),
  enforceFineTuneLimit: vi.fn(),
  incrementFineTuneUsage: vi.fn(),
  requireWorkspaceManager: vi.fn(),
  retryBackgroundJob: vi.fn(),
  enqueueBackgroundJob: vi.fn(),
  processBackgroundJobById: vi.fn(),
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

vi.mock("@/lib/billing-data", () => ({
  enforceFineTuneLimit,
  incrementFineTuneUsage,
}));

vi.mock("@/lib/auth-session", () => ({
  requireWorkspaceManager,
}));

vi.mock("@/lib/background-jobs", () => ({
  retryBackgroundJob,
  enqueueBackgroundJob,
  processBackgroundJobById,
}));

import { idleActionResult } from "@/lib/action-state";
import { launchFineTuneFromExperimentAction, processBackgroundJobAction, retryBackgroundJobAction } from "./actions";

describe("launchFineTuneFromExperimentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceFineTuneLimit.mockResolvedValue({
      allowed: true,
    });
    requireWorkspaceManager.mockResolvedValue({
      user: {
        organizationId: "org_1",
      },
    });
  });

  it("returns an error when the experiment id is missing", async () => {
    const result = await launchFineTuneFromExperimentAction(
      idleActionResult,
      new FormData(),
    );

    expect(result.status).toBe("error");
  });

  it("returns a warning when a queued job already exists", async () => {
    mockPrisma.experimentRun.findUnique.mockResolvedValue({
      id: "experiment_1",
      projectId: "project_1",
      datasetId: "dataset_1",
      name: "Refund rescue prompt pack",
      candidateModel: "llama-3-8b",
      status: "promote",
      score: 88,
      trainingJobs: [{ status: "queued" }],
      dataset: { id: "dataset_1", rowCount: 2400, qualityScore: 88 },
      project: {
        organizationId: "org_1",
      },
    });

    const formData = new FormData();
    formData.set("experimentId", "experiment_1");

    const result = await launchFineTuneFromExperimentAction(idleActionResult, formData);

    expect(result.status).toBe("warning");
    expect(result.message).toContain("already exists");
  });

  it("returns success when the fine-tune is queued", async () => {
    mockPrisma.experimentRun.findUnique.mockResolvedValue({
      id: "experiment_1",
      projectId: "project_1",
      datasetId: "dataset_1",
      name: "Refund rescue prompt pack",
      candidateModel: "llama-3-8b",
      status: "review",
      score: 88,
      trainingJobs: [],
      dataset: { id: "dataset_1", rowCount: 2400, qualityScore: 88 },
      project: {
        organizationId: "org_1",
      },
    });
    mockPrisma.trainingJob.create.mockResolvedValue({
      id: "job_1",
      name: "Refund rescue prompt pack fine-tune",
      provider: "RunPod",
      modelBase: "llama-3-8b",
    });
    getDefaultUserId.mockResolvedValue("user_1");

    const formData = new FormData();
    formData.set("experimentId", "experiment_1");

    const result = await launchFineTuneFromExperimentAction(idleActionResult, formData);

    expect(result).toMatchObject({
      status: "success",
      title: "Fine-tune launched",
    });
    expect(recordActivityEvent).toHaveBeenCalledTimes(1);
    expect(incrementFineTuneUsage).toHaveBeenCalledWith("org_1");
    expect(enqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        jobType: "launch-finetune",
      }),
    );
  });

  it("returns a warning when the plan limit blocks another fine-tune", async () => {
    enforceFineTuneLimit.mockResolvedValue({
      allowed: false,
      reason: "Your Starter plan includes 1 fine-tune job per billing period.",
    });
    mockPrisma.experimentRun.findUnique.mockResolvedValue({
      id: "experiment_1",
      projectId: "project_1",
      datasetId: "dataset_1",
      name: "Refund rescue prompt pack",
      candidateModel: "llama-3-8b",
      status: "review",
      score: 88,
      trainingJobs: [],
      dataset: { id: "dataset_1", rowCount: 2400, qualityScore: 88 },
      project: {
        organizationId: "org_1",
      },
    });

    const formData = new FormData();
    formData.set("experimentId", "experiment_1");

    const result = await launchFineTuneFromExperimentAction(idleActionResult, formData);

    expect(result.status).toBe("warning");
    expect(result.title).toBe("Plan limit reached");
  });

  it("requeues a failed background job", async () => {
    mockPrisma.backgroundJob.findFirst.mockResolvedValue({
      id: "bg_1",
      status: "failed",
    });

    const formData = new FormData();
    formData.set("backgroundJobId", "bg_1");

    const result = await retryBackgroundJobAction(idleActionResult, formData);

    expect(result.status).toBe("success");
    expect(retryBackgroundJob).toHaveBeenCalledWith("bg_1");
    expect(revalidatePath).toHaveBeenCalledWith("/jobs");
  });

  it("processes a queued background job for the workspace", async () => {
    mockPrisma.backgroundJob.findFirst.mockResolvedValue({
      id: "bg_2",
      status: "queued",
    });

    const formData = new FormData();
    formData.set("backgroundJobId", "bg_2");

    const result = await processBackgroundJobAction(idleActionResult, formData);

    expect(result.status).toBe("success");
    expect(processBackgroundJobById).toHaveBeenCalledWith("bg_2");
  });
});
