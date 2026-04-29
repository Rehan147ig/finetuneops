import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    slackIntegration: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
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
  buildSlackPayload,
  connectSlackIntegration,
  isValidSlackWebhookUrl,
  sendSlackMessage,
  testSlackIntegration,
} from "./slack";

describe("slack integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("sends the correct payload for finetune_completed", () => {
    const payload = buildSlackPayload({
      type: "finetune_completed",
      jobName: "Refund Assistant v2",
      modelId: "ft:gpt-4o-mini:org:custom:id",
      trainedTokens: 12450,
      path: "/jobs",
    });

    expect(payload.text).toContain("Fine-tune complete");
    expect(JSON.stringify(payload)).toContain("12,450");
    expect(JSON.stringify(payload)).toContain("ft:gpt-4o-mini:org:custom:id");
  });

  it("rejects invalid webhook URLs", async () => {
    await expect(
      connectSlackIntegration({
        workspaceId: "org_1",
        webhookUrl: "https://example.com/not-slack",
        channel: "alerts",
        createdBy: "user_1",
      }),
    ).rejects.toThrow("Webhook URL must start with https://hooks.slack.com/");
    expect(isValidSlackWebhookUrl("https://example.com/not-slack")).toBe(false);
  });

  it("sends a test message on connect and stores the integration", async () => {
    mockPrisma.slackIntegration.upsert.mockResolvedValue({
      id: "slack_1",
      channel: "#alerts",
      isActive: true,
    });

    const result = await connectSlackIntegration({
      workspaceId: "org_1",
      webhookUrl: "https://hooks.slack.com/services/test/webhook",
      channel: "alerts",
      createdBy: "user_1",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test/webhook",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(mockPrisma.slackIntegration.upsert).toHaveBeenCalled();
    expect(result.channel).toBe("#alerts");
  });

  it("tests an existing integration with a Slack message", async () => {
    mockPrisma.slackIntegration.findUnique.mockResolvedValue({
      workspaceId: "org_1",
      webhookUrl: "https://hooks.slack.com/services/test/webhook",
      channel: "#alerts",
      isActive: true,
    });

    const result = await testSlackIntegration("org_1");

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends a workspace Slack message when an integration is active", async () => {
    mockPrisma.slackIntegration.findUnique.mockResolvedValue({
      workspaceId: "org_1",
      webhookUrl: "https://hooks.slack.com/services/test/webhook",
      channel: "#alerts",
      isActive: true,
    });

    await sendSlackMessage("org_1", {
      type: "dataset_low_quality",
      datasetName: "Support Export",
      healthScore: 43,
      issuesSummary: "43 duplicates, 3 PII traces",
      path: "/datasets/dataset_1",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test/webhook",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});

