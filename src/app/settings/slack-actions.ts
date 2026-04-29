"use server";

import { revalidatePath } from "next/cache";
import { errorResult, successResult, type ActionResult } from "@/lib/action-state";
import { requireWorkspaceManager } from "@/lib/auth-session";
import { logAuditEvent } from "@/lib/audit";
import {
  connectSlackIntegration,
  isValidSlackWebhookUrl,
  removeSlackIntegration,
  testSlackIntegration,
} from "@/lib/slack";

export async function connectSlackAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireWorkspaceManager();
  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
  const channel = String(formData.get("channel") ?? "").trim();

  if (!isValidSlackWebhookUrl(webhookUrl)) {
    return errorResult("Webhook URL must start with https://hooks.slack.com/.");
  }

  if (!channel) {
    return errorResult("Add a Slack channel name before connecting.");
  }

  await connectSlackIntegration({
    workspaceId: session.user.organizationId,
    webhookUrl,
    channel,
    createdBy: session.user.id,
  });

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "slack_integration_connected",
    targetType: "slack_integration",
    targetName: channel,
    metadata: {
      channel,
    },
  });

  revalidatePath("/settings");
  return successResult("Slack connected successfully.", "Slack connected");
}

export async function disconnectSlackAction(
  _previousState: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  const session = await requireWorkspaceManager();
  await removeSlackIntegration(session.user.organizationId);

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "slack_integration_removed",
    targetType: "slack_integration",
    targetName: "workspace_slack",
  });

  revalidatePath("/settings");
  return successResult("Slack has been disconnected.", "Slack removed");
}

export async function testSlackConnectionAction(
  _previousState: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  const session = await requireWorkspaceManager();
  const result = await testSlackIntegration(session.user.organizationId);

  if (!result.ok) {
    return errorResult(result.error ?? "Slack test failed.");
  }

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "slack_integration_tested",
    targetType: "slack_integration",
    targetName: "workspace_slack",
    metadata: {
      ok: true,
    },
  });

  revalidatePath("/settings");
  return successResult("Slack test message sent.", "Slack healthy");
}
