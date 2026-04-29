import { prisma } from "@/lib/prisma";
import { getServerEnv } from "@/lib/env";

const env = getServerEnv();

export type SlackMessage =
  | {
      type: "finetune_completed";
      jobName: string;
      modelId: string;
      trainedTokens: number;
      path?: string;
    }
  | {
      type: "finetune_failed";
      jobName: string;
      errorMessage: string;
      path?: string;
    }
  | {
      type: "dataset_low_quality";
      datasetName: string;
      healthScore: number;
      issuesSummary: string;
      path?: string;
    }
  | {
      type: "release_pending";
      releaseName: string;
      pendingFor: string;
      path?: string;
    };

function normalizeChannel(channel: string) {
  const trimmed = channel.trim();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function isValidSlackWebhookUrl(webhookUrl: string) {
  return webhookUrl.startsWith("https://hooks.slack.com/");
}

function getMessageLink(path?: string) {
  return `${env.APP_URL}${path ?? "/settings"}`;
}

export function buildSlackPayload(message: SlackMessage) {
  switch (message.type) {
    case "finetune_completed":
      return {
        text: `Fine-tune complete - ${message.jobName}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:white_check_mark: *Fine-tune complete* - ${message.jobName}\nModel: ${message.modelId}\nTrained tokens: ${message.trainedTokens.toLocaleString("en-US")}\nView in FinetuneOps: ${getMessageLink(message.path ?? "/jobs")}`,
            },
          },
        ],
      };
    case "finetune_failed":
      return {
        text: `Fine-tune failed - ${message.jobName}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:red_circle: *Fine-tune failed* - ${message.jobName}\nError: ${message.errorMessage}\nView in FinetuneOps: ${getMessageLink(message.path ?? "/jobs")}`,
            },
          },
        ],
      };
    case "dataset_low_quality":
      return {
        text: `Dataset quality warning - ${message.datasetName}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:warning: *Dataset quality warning* - ${message.datasetName}\nHealth score: ${message.healthScore}/100\nIssues: ${message.issuesSummary}\nView report: ${getMessageLink(message.path ?? "/datasets")}`,
            },
          },
        ],
      };
    case "release_pending":
      return {
        text: `Release pending review - ${message.releaseName}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:clipboard: *Release pending review* - ${message.releaseName}\nWaiting for approval for ${message.pendingFor}\nReview now: ${getMessageLink(message.path ?? "/releases")}`,
            },
          },
        ],
      };
  }
}

async function postToSlack(webhookUrl: string, payload: Record<string, unknown>) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Slack webhook request failed");
  }
}

export async function connectSlackIntegration(input: {
  workspaceId: string;
  webhookUrl: string;
  channel: string;
  createdBy: string;
}) {
  if (!isValidSlackWebhookUrl(input.webhookUrl)) {
    throw new Error("Webhook URL must start with https://hooks.slack.com/");
  }

  const channel = normalizeChannel(input.channel);
  await postToSlack(input.webhookUrl, {
    text: `FinetuneOps connected successfully to ${channel}`,
  });

  return prisma.slackIntegration.upsert({
    where: {
      workspaceId: input.workspaceId,
    },
    update: {
      webhookUrl: input.webhookUrl,
      channel,
      isActive: true,
      createdBy: input.createdBy,
    },
    create: {
      workspaceId: input.workspaceId,
      webhookUrl: input.webhookUrl,
      channel,
      isActive: true,
      createdBy: input.createdBy,
    },
    select: {
      id: true,
      channel: true,
      isActive: true,
    },
  });
}

export async function removeSlackIntegration(workspaceId: string) {
  await prisma.slackIntegration.deleteMany({
    where: {
      workspaceId,
    },
  });
}

export async function testSlackIntegration(workspaceId: string) {
  const integration = await prisma.slackIntegration.findUnique({
    where: {
      workspaceId,
    },
  });

  if (!integration || !integration.isActive) {
    return {
      ok: false,
      error: "Slack is not connected for this workspace.",
    };
  }

  await postToSlack(integration.webhookUrl, {
    text: `FinetuneOps connected successfully to ${integration.channel}`,
  });

  return {
    ok: true,
  };
}

export async function sendSlackMessage(workspaceId: string, message: SlackMessage): Promise<void> {
  const integration = await prisma.slackIntegration.findUnique({
    where: {
      workspaceId,
    },
  });

  if (!integration || !integration.isActive) {
    return;
  }

  await postToSlack(integration.webhookUrl, buildSlackPayload(message));
}
