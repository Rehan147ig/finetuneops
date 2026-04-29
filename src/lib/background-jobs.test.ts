import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  queueAdd,
  queueClose,
  recordActivityEvent,
} = vi.hoisted(() => ({
  mockPrisma: {
    backgroundJob: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    dataset: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    datasetQualityReport: {
      upsert: vi.fn(),
    },
    experimentRun: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    trainingJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  queueAdd: vi.fn(),
  queueClose: vi.fn(),
  recordActivityEvent: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add = queueAdd;
    close = queueClose;
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/workspace-data", () => ({
  recordActivityEvent,
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/finetuneops?schema=public",
    NEXTAUTH_SECRET: "secret",
    NEXTAUTH_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "google",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GITHUB_CLIENT_ID: "github",
    GITHUB_CLIENT_SECRET: "github-secret",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_PUBLISHABLE_KEY: "pk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "FineTuneOps <test@example.com>",
    REDIS_URL: "redis://localhost:6379",
    ENCRYPTION_KEY: "12345678901234567890123456789012",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    APP_URL: "http://localhost:3000",
  }),
}));

import {
  completeBackgroundJob,
  enqueueBackgroundJob,
  parseJobLogs,
  parseJobPayload,
  processBackgroundJobById,
  retryBackgroundJob,
} from "@/lib/background-jobs";

describe("background jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues a persisted background job in BullMQ", async () => {
    mockPrisma.backgroundJob.create.mockResolvedValue({
      id: "bg_1",
    });

    await enqueueBackgroundJob({
      organizationId: "org_1",
      projectId: "project_1",
      jobType: "score-dataset",
      payload: {
        datasetId: "dataset_1",
      },
    });

    expect(mockPrisma.backgroundJob.create).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(
      "score-dataset",
      expect.objectContaining({
        backgroundJobId: "bg_1",
        organizationId: "org_1",
      }),
      undefined,
    );
  });

  it("marks a background job complete and records activity", async () => {
    mockPrisma.backgroundJob.findUniqueOrThrow.mockResolvedValue({
      id: "bg_1",
      projectId: "project_1",
      queueName: "finetuneops-background-jobs",
      jobType: "generate-nudges",
      logs: JSON.stringify(["Queued generate-nudges"]),
    });
    mockPrisma.backgroundJob.update.mockResolvedValue({
      id: "bg_1",
      status: "completed",
    });

    await completeBackgroundJob({
      backgroundJobId: "bg_1",
      message: "Nudges recalculated successfully.",
    });

    expect(mockPrisma.backgroundJob.update).toHaveBeenCalledTimes(1);
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "background_job_completed",
        projectId: "project_1",
      }),
    );
  });

  it("requeues a failed background job for manual retry", async () => {
    mockPrisma.backgroundJob.findUniqueOrThrow.mockResolvedValue({
      id: "bg_1",
      organizationId: "org_1",
      projectId: "project_1",
      jobType: "send-notification",
      logs: JSON.stringify(["Slack webhook timed out"]),
      payload: JSON.stringify({
        channel: "#alerts",
      }),
    });
    mockPrisma.backgroundJob.update.mockResolvedValue({
      id: "bg_1",
    });

    await retryBackgroundJob("bg_1");

    expect(mockPrisma.backgroundJob.update).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(
      "send-notification",
      expect.objectContaining({
        backgroundJobId: "bg_1",
      }),
    );
  });

  it("parses logs and payload safely", () => {
    expect(parseJobLogs(JSON.stringify(["one", "two"]))).toEqual(["one", "two"]);
    expect(parseJobLogs("bad-json")).toEqual([]);
    expect(parseJobPayload(JSON.stringify({ traceId: "trace_1" }))).toEqual({
      traceId: "trace_1",
    });
    expect(parseJobPayload("bad-json")).toEqual({});
  });

  it("processes a dataset scoring job and updates the dataset", async () => {
    mockPrisma.backgroundJob.findUniqueOrThrow.mockResolvedValue({
      id: "bg_score",
      projectId: "project_1",
      queueName: "finetuneops-background-jobs",
      jobType: "score-dataset",
      payload: JSON.stringify({
        datasetId: "dataset_1",
      }),
      startedAt: null,
      estimatedCompletionAt: null,
      logs: JSON.stringify(["Queued score-dataset"]),
    });
    mockPrisma.dataset.findUnique.mockResolvedValue({
      id: "dataset_1",
      name: "Refund dataset",
      projectId: "project_1",
      examples: [
        {
          id: "example_1",
          inputText: "refund policy details",
          outputText: "refund approved",
        },
        {
          id: "example_2",
          inputText: "refund policy details",
          outputText: "refund approved",
        },
      ],
    });
    mockPrisma.datasetQualityReport.upsert.mockResolvedValue({
      id: "report_1",
      datasetId: "dataset_1",
    });
    mockPrisma.dataset.update.mockResolvedValue({
      id: "dataset_1",
      qualityScore: 98,
      status: "ready",
    });
    mockPrisma.backgroundJob.update.mockResolvedValue({
      id: "bg_score",
      status: "completed",
    });

    await processBackgroundJobById("bg_score");

    expect(mockPrisma.dataset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dataset_1" },
      }),
    );
    expect(mockPrisma.datasetQualityReport.upsert).toHaveBeenCalledTimes(1);
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "dataset_scored",
        projectId: "project_1",
      }),
    );
  });

  it("processes a fine-tune launch job and updates the training job", async () => {
    mockPrisma.backgroundJob.findUniqueOrThrow.mockResolvedValue({
      id: "bg_train",
      projectId: "project_1",
      queueName: "finetuneops-background-jobs",
      jobType: "launch-finetune",
      payload: JSON.stringify({
        trainingJobId: "train_1",
      }),
      startedAt: null,
      estimatedCompletionAt: null,
      logs: JSON.stringify(["Queued launch-finetune"]),
    });
    mockPrisma.trainingJob.findUnique.mockResolvedValue({
      id: "train_1",
      gpuHours: 0,
      startedAt: null,
    });
    mockPrisma.trainingJob.update.mockResolvedValue({
      id: "train_1",
      status: "completed",
    });
    mockPrisma.backgroundJob.update.mockResolvedValue({
      id: "bg_train",
      status: "completed",
    });

    await processBackgroundJobById("bg_train");

    expect(mockPrisma.trainingJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "train_1" },
      }),
    );
  });
});
