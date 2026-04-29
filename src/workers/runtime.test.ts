import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  updateBackgroundJobProgress,
  completeBackgroundJob,
  failBackgroundJob,
  enqueueBackgroundJob,
  incrementTraceUsage,
  getActiveCredential,
  recordActivityEvent,
  resendSend,
  queueGetWaitingCount,
  queueGetActiveCount,
  queueClose,
  openAiFilesCreate,
  openAiFineTuningCreate,
  openAiFineTuningRetrieve,
  sendSlackMessage,
} = vi.hoisted(() => ({
  mockPrisma: {
    traceEvent: {
      create: vi.fn(),
    },
    dataset: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    datasetQualityReport: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    trainingJob: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    notificationLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
  updateBackgroundJobProgress: vi.fn(),
  completeBackgroundJob: vi.fn(),
  failBackgroundJob: vi.fn(),
  enqueueBackgroundJob: vi.fn(),
  incrementTraceUsage: vi.fn(),
  getActiveCredential: vi.fn(),
  recordActivityEvent: vi.fn(),
  resendSend: vi.fn(),
  queueGetWaitingCount: vi.fn(),
  queueGetActiveCount: vi.fn(),
  queueClose: vi.fn(),
  openAiFilesCreate: vi.fn(),
  openAiFineTuningCreate: vi.fn(),
  openAiFineTuningRetrieve: vi.fn(),
  sendSlackMessage: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    files = {
      create: openAiFilesCreate,
    };

    fineTuning = {
      jobs: {
        create: openAiFineTuningCreate,
        retrieve: openAiFineTuningRetrieve,
      },
    };
  },
}));

vi.mock("../lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("../lib/background-jobs", () => ({
  backgroundJobTypes: [
    "ingest-trace",
    "score-dataset",
    "run-experiment",
    "launch-finetune",
    "poll-finetune",
    "send-notification",
    "expire-review-links",
    "generate-nudges",
    "run-ab-test",
    "safety-scan",
  ],
  getQueueNameForJobType: (jobType: string) => `finetuneops-${jobType}`,
  getBackgroundJobQueue: () => ({
    getWaitingCount: queueGetWaitingCount,
    getActiveCount: queueGetActiveCount,
    close: queueClose,
  }),
  updateBackgroundJobProgress,
  completeBackgroundJob,
  failBackgroundJob,
  enqueueBackgroundJob,
}));

vi.mock("../lib/billing-data", () => ({
  incrementTraceUsage,
}));

vi.mock("../lib/provider-credentials", () => ({
  getActiveCredential,
}));

vi.mock("../lib/workspace-data", () => ({
  recordActivityEvent,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: resendSend,
    };
  },
}));

vi.mock("../lib/slack", () => ({
  sendSlackMessage,
}));

vi.mock("../lib/env", () => ({
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
    REDIS_URL: "redis://localhost:6379",
    ENCRYPTION_KEY: "12345678901234567890123456789012",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    RESEND_FROM_EMAIL: "FineTuneOps <test@example.com>",
    APP_URL: "http://localhost:3000",
    SENTRY_DSN: "",
    LOG_LEVEL: "info",
  }),
}));

import {
  buildFineTuneJsonl,
  createWorkerHealthServer,
  gracefulShutdown,
  handleIngestTraceJob,
  handleLaunchFineTuneJob,
  handlePollFineTuneJob,
  handleScoreDatasetJob,
  handleSendNotificationJob,
} from "./runtime";

function makeJob(input: {
  name: string;
  backgroundJobId?: string;
  organizationId?: string;
  projectId?: string | null;
  payload?: Record<string, unknown>;
}) {
  return {
    id: `${input.name}_job`,
    name: input.name,
    data: {
      backgroundJobId: input.backgroundJobId ?? "bg_1",
      organizationId: input.organizationId ?? "org_1",
      projectId: input.projectId ?? "project_1",
      payload: input.payload ?? {},
    },
  } as const;
}

describe("worker runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueGetWaitingCount.mockResolvedValue(0);
    queueGetActiveCount.mockResolvedValue(0);
    queueClose.mockResolvedValue(undefined);
    sendSlackMessage.mockResolvedValue(undefined);

    if (typeof File === "undefined") {
      vi.stubGlobal(
        "File",
        class MockFile extends Blob {
          name: string;
          lastModified: number;

          constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) {
            super(parts, options);
            this.name = name;
            this.lastModified = Date.now();
          }
        },
      );
    }
  });

  it("builds fine-tune JSONL lines correctly", () => {
    expect(
      buildFineTuneJsonl([
        { inputText: "refund policy", outputText: "Refunds take five business days." },
      ]),
    ).toBe(
      '{"messages":[{"role":"user","content":"refund policy"},{"role":"assistant","content":"Refunds take five business days."}]}',
    );
  });

  it("ingest-trace validates and saves correctly", async () => {
    mockPrisma.traceEvent.create.mockResolvedValue({
      id: "trace_1",
      title: "Refund policy confusion in support assistant",
      projectId: "project_1",
    });
    completeBackgroundJob.mockResolvedValue({ id: "bg_1" });

    await handleIngestTraceJob(
      makeJob({
        name: "ingest-trace",
        payload: {
          trace: {
            projectId: "project_1",
            title: "Refund policy confusion in support assistant",
            source: "support-bot",
            inputText: "Customer asked for the refund timeline.",
            outputText: "Refunds take five business days.",
            modelName: "gpt-4o-mini",
            latencyMs: 340,
          },
        },
      }) as never,
    );

    expect(mockPrisma.traceEvent.create).toHaveBeenCalledTimes(1);
    expect(incrementTraceUsage).toHaveBeenCalledWith("org_1");
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "trace_captured",
      }),
    );
  });

  it("ingest-trace rejects invalid payload", async () => {
    await expect(
      handleIngestTraceJob(
        makeJob({
          name: "ingest-trace",
          payload: {
            trace: {
              projectId: "",
              title: "short",
              source: "x",
            },
          },
        }) as never,
      ),
    ).rejects.toThrow("Trace payload validation failed");

    expect(failBackgroundJob).toHaveBeenCalled();
    expect(mockPrisma.traceEvent.create).not.toHaveBeenCalled();
  });

  it("score-dataset worker runs quality engine and saves report", async () => {
    mockPrisma.dataset.findUnique.mockResolvedValue({
      id: "dataset_1",
      name: "Support dataset",
      version: "v3",
      projectId: "project_1",
      examples: [
        { id: "ex_1", inputText: "refund policy details", outputText: "refund approved" },
        { id: "ex_2", inputText: "refund policy details", outputText: "refund approved" },
      ],
      project: { id: "project_1" },
    });
    completeBackgroundJob.mockResolvedValue({ id: "bg_1" });

    await handleScoreDatasetJob(
      makeJob({
        name: "score-dataset",
        payload: { datasetId: "dataset_1" },
      }) as never,
    );

    expect(mockPrisma.datasetQualityReport.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.dataset.update).toHaveBeenCalledTimes(1);
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "dataset_scored",
      }),
    );
  });

  it("launch-finetune worker fails cleanly with no credential", async () => {
    getActiveCredential.mockResolvedValue(null);
    mockPrisma.trainingJob.update.mockResolvedValue({ id: "train_1" });

    await expect(
      handleLaunchFineTuneJob(
        makeJob({
          name: "launch-finetune",
          payload: { trainingJobId: "train_1" },
        }) as never,
      ),
    ).rejects.toThrow("No OpenAI key configured");

    expect(mockPrisma.trainingJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "No OpenAI key configured",
        }),
      }),
    );
  });

  it("launch-finetune fails cleanly with empty dataset", async () => {
    getActiveCredential.mockResolvedValue("openai-key");
    mockPrisma.trainingJob.findFirst.mockResolvedValue({
      id: "train_1",
      projectId: "project_1",
      modelBase: "gpt-4o-mini",
      datasetId: "dataset_1",
      dataset: {
        examples: [],
      },
      project: { id: "project_1" },
    });
    mockPrisma.trainingJob.update.mockResolvedValue({ id: "train_1" });

    await expect(
      handleLaunchFineTuneJob(
        makeJob({
          name: "launch-finetune",
          payload: { trainingJobId: "train_1" },
        }) as never,
      ),
    ).rejects.toThrow("Dataset has no examples to fine-tune on");
  });

  it("launch-finetune builds correct JSONL format and stores openaiJobId", async () => {
    getActiveCredential.mockResolvedValue("openai-key");
    mockPrisma.trainingJob.findFirst.mockResolvedValue({
      id: "train_1",
      projectId: "project_1",
      modelBase: "gpt-4o-mini",
      datasetId: "dataset_1",
      dataset: {
        examples: [
          { inputText: "refund policy", outputText: "Refunds arrive in five business days." },
        ],
      },
      project: { id: "project_1" },
    });
    mockPrisma.datasetQualityReport.findUnique.mockResolvedValue(null);
    mockPrisma.trainingJob.update.mockResolvedValue({ id: "train_1" });
    completeBackgroundJob.mockResolvedValue({ id: "bg_1" });
    openAiFilesCreate.mockResolvedValue({ id: "file_123" });
    openAiFineTuningCreate.mockResolvedValue({ id: "ftjob_123", status: "queued" });

    await handleLaunchFineTuneJob(
      makeJob({
        name: "launch-finetune",
        payload: { trainingJobId: "train_1" },
      }) as never,
    );

    const fileArg = openAiFilesCreate.mock.calls[0]?.[0]?.file;
    const fileText = await fileArg.text();

    expect(fileText).toContain('"role":"user"');
    expect(fileText).toContain("refund policy");
    expect(mockPrisma.trainingJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          openaiJobId: "ftjob_123",
          openaiFileId: "file_123",
          status: "running",
        }),
      }),
    );
    expect(enqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "poll-finetune",
      }),
    );
  });

  it("poll-finetune skips cancelled jobs", async () => {
    mockPrisma.trainingJob.findFirst.mockResolvedValue({
      id: "train_1",
      status: "cancelled",
      project: { id: "project_1" },
    });

    await handlePollFineTuneJob(
      makeJob({
        name: "poll-finetune",
        payload: { trainingJobId: "train_1" },
      }) as never,
    );

    expect(openAiFineTuningRetrieve).not.toHaveBeenCalled();
    expect(mockPrisma.trainingJob.update).not.toHaveBeenCalled();
  });

  it("poll-finetune increments pollCount and re-enqueues when running", async () => {
    mockPrisma.trainingJob.findFirst.mockResolvedValue({
      id: "train_1",
      status: "running",
      project: { id: "project_1" },
    });
    mockPrisma.trainingJob.update
      .mockResolvedValueOnce({
        id: "train_1",
        projectId: "project_1",
        name: "Refund finetune",
        openaiJobId: "ftjob_123",
        pollCount: 1,
      })
      .mockResolvedValueOnce({ id: "train_1" });
    getActiveCredential.mockResolvedValue("openai-key");
    openAiFineTuningRetrieve.mockResolvedValue({
      id: "ftjob_123",
      status: "running",
      trained_tokens: 1200,
    });
    completeBackgroundJob.mockResolvedValue({ id: "bg_1" });

    await handlePollFineTuneJob(
      makeJob({
        name: "poll-finetune",
        payload: { trainingJobId: "train_1" },
      }) as never,
    );

    expect(mockPrisma.trainingJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pollCount: {
            increment: 1,
          },
        }),
      }),
    );
    expect(enqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "poll-finetune",
        delayMs: 60_000,
      }),
    );
  });

  it("poll-finetune completes and stores model ID when succeeded", async () => {
    mockPrisma.trainingJob.findFirst.mockResolvedValue({
      id: "train_1",
      status: "running",
      project: { id: "project_1" },
    });
    mockPrisma.trainingJob.update
      .mockResolvedValueOnce({
        id: "train_1",
        projectId: "project_1",
        name: "Refund finetune",
        openaiJobId: "ftjob_123",
        pollCount: 2,
      })
      .mockResolvedValueOnce({ id: "train_1" });
    getActiveCredential.mockResolvedValue("openai-key");
    openAiFineTuningRetrieve.mockResolvedValue({
      id: "ftjob_123",
      status: "succeeded",
      fine_tuned_model: "ft:gpt-4o-mini:acme:refunds",
      trained_tokens: 4000,
      result_files: [{ metrics: { validation_loss: 0.42 } }],
    });
    completeBackgroundJob.mockResolvedValue({ id: "bg_1" });

    await handlePollFineTuneJob(
      makeJob({
        name: "poll-finetune",
        payload: { trainingJobId: "train_1" },
      }) as never,
    );

    expect(mockPrisma.trainingJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "completed",
          completedModelId: "ft:gpt-4o-mini:acme:refunds",
          trainedTokens: 4000,
          validationLoss: 0.42,
          progressNote: "Training complete",
        }),
      }),
    );
    expect(enqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "send-notification",
      }),
    );
  });

  it("poll-finetune fails after pollCount exceeds 2000", async () => {
    mockPrisma.trainingJob.findFirst.mockResolvedValue({
      id: "train_1",
      status: "running",
      project: { id: "project_1" },
    });
    mockPrisma.trainingJob.update
      .mockResolvedValueOnce({
        id: "train_1",
        projectId: "project_1",
        name: "Refund finetune",
        openaiJobId: "ftjob_123",
        pollCount: 2001,
      })
      .mockResolvedValueOnce({ id: "train_1" });

    await handlePollFineTuneJob(
      makeJob({
        name: "poll-finetune",
        payload: { trainingJobId: "train_1" },
      }) as never,
    );

    expect(openAiFineTuningRetrieve).not.toHaveBeenCalled();
    expect(enqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "send-notification",
        payload: expect.objectContaining({
          type: "finetune_failed",
          errorMessage: "Polling timeout after 33 hours",
        }),
      }),
    );
  });

  it("send-notification skips duplicate within 24h", async () => {
    mockPrisma.notificationLog.findFirst.mockResolvedValue({ id: "notif_1" });
    completeBackgroundJob.mockResolvedValue({ id: "bg_1" });

    await handleSendNotificationJob(
      makeJob({
        name: "send-notification",
        payload: {
          type: "finetune_completed",
          trainingJobId: "train_1",
        },
      }) as never,
    );

    expect(resendSend).not.toHaveBeenCalled();
    expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
  });

  it("send-notification logs to NotificationLog after send", async () => {
    mockPrisma.notificationLog.findFirst.mockResolvedValue(null);
    mockPrisma.notificationLog.create.mockResolvedValue({ id: "notif_1" });
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: "org_1",
      users: [
        { email: "owner@example.com", role: "owner" },
        { email: "admin@example.com", role: "admin" },
      ],
    });
    completeBackgroundJob.mockResolvedValue({ id: "bg_1" });

    await handleSendNotificationJob(
      makeJob({
        name: "send-notification",
        payload: {
          type: "finetune_completed",
          trainingJobId: "train_1",
        },
      }) as never,
    );

    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["owner@example.com", "admin@example.com"],
        subject: "Your FinetuneOps fine-tune completed",
      }),
    );
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "org_1",
          type: "finetune_completed",
          referenceId: "train_1",
        }),
      }),
    );
  });

  it("worker sends Slack after email", async () => {
    mockPrisma.notificationLog.findFirst.mockResolvedValue(null);
    mockPrisma.notificationLog.create.mockResolvedValue({ id: "notif_1" });
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: "org_1",
      users: [
        { email: "owner@example.com", role: "owner" },
        { email: "admin@example.com", role: "admin" },
      ],
    });
    completeBackgroundJob.mockResolvedValue({ id: "bg_1" });

    await handleSendNotificationJob(
      makeJob({
        name: "send-notification",
        payload: {
          type: "finetune_completed",
          trainingJobId: "train_1",
          jobName: "Refund finetune",
          modelId: "ft:gpt-4o-mini:acme:refunds",
          trainedTokens: 4000,
        },
      }) as never,
    );

    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(sendSlackMessage).toHaveBeenCalledWith(
      "org_1",
      expect.objectContaining({
        type: "finetune_completed",
        jobName: "Refund finetune",
      }),
    );
  });

  it("Slack failure does not fail the notification job", async () => {
    mockPrisma.notificationLog.findFirst.mockResolvedValue(null);
    mockPrisma.notificationLog.create.mockResolvedValue({ id: "notif_1" });
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: "org_1",
      users: [{ email: "owner@example.com", role: "owner" }],
    });
    sendSlackMessage.mockRejectedValue(new Error("Slack offline"));
    completeBackgroundJob.mockResolvedValue({ id: "bg_1" });

    await handleSendNotificationJob(
      makeJob({
        name: "send-notification",
        payload: {
          type: "finetune_completed",
          trainingJobId: "train_1",
          jobName: "Refund finetune",
          modelId: "ft:gpt-4o-mini:acme:refunds",
          trainedTokens: 4000,
        },
      }) as never,
    );

    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledTimes(1);
    expect(completeBackgroundJob).toHaveBeenCalled();
  });

  it("health endpoint includes queue stats", async () => {
    queueGetWaitingCount.mockResolvedValue(12);
    queueGetActiveCount.mockResolvedValue(3);

    const server = createWorkerHealthServer(["ingest-trace"], 0);
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected worker health server to bind to a port");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workers).toEqual(["ingest-trace"]);
    expect(body.queues["ingest-trace"]).toEqual(
      expect.objectContaining({
        waiting: 12,
        active: 3,
      }),
    );

    await gracefulShutdown({
      workers: [],
      server,
      timeoutMs: 100,
    });
  });

  it("graceful shutdown does not drop in-flight jobs", async () => {
    let resolved = false;
    const worker = {
      name: "ingest-trace",
      close: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              resolved = true;
              resolve();
            }, 10);
          }),
      ),
    };

    const server = createWorkerHealthServer(["finetuneops-ingest-trace"], 0);
    await gracefulShutdown({
      workers: [worker],
      server,
      timeoutMs: 100,
    });

    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(true);
  });
});
