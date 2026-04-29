import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, recordActivityEvent, getDefaultUserId, revalidatePath, enqueueBackgroundJob } = vi.hoisted(() => ({
  mockPrisma: {
    project: {
      findFirst: vi.fn(),
    },
    traceEvent: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    dataset: {
      create: vi.fn(),
    },
    datasetExample: {
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
import { createTraceAction, promoteTraceToDatasetAction } from "./actions";

describe("createTraceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error result when validation fails", async () => {
    const formData = new FormData();
    formData.set("title", "short");
    formData.set("source", "src");
    formData.set("severity", "high");

    const result = await createTraceAction(idleActionResult, formData);

    expect(result.status).toBe("error");
    expect(result.message).toContain("Title");
  });

  it("returns success when a trace is captured", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "project_1", organizationId: "org_1" });
    mockPrisma.traceEvent.create.mockResolvedValue({ id: "trace_1" });
    getDefaultUserId.mockResolvedValue("user_1");

    const formData = new FormData();
    formData.set("title", "Escalation loop after refund denial");
    formData.set("source", "Support copilot trace");
    formData.set("severity", "high");

    const result = await createTraceAction(idleActionResult, formData);

    expect(result).toMatchObject({
      status: "success",
      title: "Trace captured",
    });
    expect(mockPrisma.traceEvent.create).toHaveBeenCalledTimes(1);
    expect(recordActivityEvent).toHaveBeenCalledTimes(1);
    expect(enqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        jobType: "ingest-trace",
      }),
    );
  });
});

describe("promoteTraceToDatasetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a warning result when trace promotion is blocked", async () => {
    mockPrisma.traceEvent.findUnique.mockResolvedValue({
      id: "trace_1",
      title: "Needs labels first",
      projectId: "project_1",
      status: "needs_labeling",
      opportunityScore: 88,
      convertedDatasetId: null,
      project: {
        datasets: [],
      },
    });

    const formData = new FormData();
    formData.set("traceId", "trace_1");

    const result = await promoteTraceToDatasetAction(idleActionResult, formData);

    expect(result.status).toBe("warning");
    expect(result.message).toContain("labeling");
  });

  it("returns success when a trace becomes a dataset", async () => {
    mockPrisma.traceEvent.findUnique.mockResolvedValue({
      id: "trace_1",
      title: "Escalation loop after refund request",
      source: "Support copilot trace",
      projectId: "project_1",
      status: "triaged",
      opportunityScore: 91,
      spanCount: 4,
      convertedDatasetId: null,
      project: {
        organizationId: "org_1",
        datasets: [{ version: "v1" }, { version: "v2" }],
      },
    });
    mockPrisma.dataset.create.mockResolvedValue({
      id: "dataset_1",
      name: "Escalation loop",
      version: "v3",
      rowCount: 96,
      qualityScore: 91,
    });
    mockPrisma.traceEvent.update.mockResolvedValue({ id: "trace_1" });
    getDefaultUserId.mockResolvedValue("user_1");

    const formData = new FormData();
    formData.set("traceId", "trace_1");

    const result = await promoteTraceToDatasetAction(idleActionResult, formData);

    expect(result).toMatchObject({
      status: "success",
      title: "Dataset created",
    });
    expect(mockPrisma.datasetExample.create).toHaveBeenCalledTimes(1);
    expect(recordActivityEvent).toHaveBeenCalledTimes(2);
    expect(enqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        jobType: "score-dataset",
      }),
    );
  });
});
