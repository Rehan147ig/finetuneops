import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { logAuditEvent } from "@/lib/audit";
import { canManageIntegrations } from "@/lib/authz";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { connectSlackIntegration, isValidSlackWebhookUrl, removeSlackIntegration } from "@/lib/slack";

export const POST = withApiErrorHandling("slack_connect_failed", async (request: Request) => {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!canManageIntegrations(session.user.role)) {
    return NextResponse.json(
      { error: "Only workspace owners or admins can manage Slack integrations." },
      { status: 403 },
    );
  }

  const rl = await checkRateLimit(session.user.organizationId, "api");

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "API rate limit exceeded", retryAfter: 60 },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const contentLength = request.headers.get("content-length");

  if (contentLength && Number.parseInt(contentLength, 10) > 10_240) {
    return NextResponse.json(
      { error: "Request too large. Maximum size is 10KB." },
      { status: 413 },
    );
  }

  const rawBody = await request.text();

  if (rawBody.length > 10_240) {
    return NextResponse.json(
      { error: "Request too large. Maximum size is 10KB." },
      { status: 413 },
    );
  }

  let body: unknown = null;

  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    body = null;
  }

  const parsedBody = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const webhookUrl = typeof parsedBody.webhookUrl === "string" ? parsedBody.webhookUrl.trim() : "";
  const channel = typeof parsedBody.channel === "string" ? parsedBody.channel.trim() : "";

  if (!isValidSlackWebhookUrl(webhookUrl)) {
    return NextResponse.json(
      { error: "Webhook URL must start with https://hooks.slack.com/." },
      { status: 400 },
    );
  }

  if (!channel) {
    return NextResponse.json({ error: "Channel is required." }, { status: 400 });
  }

  const integration = await connectSlackIntegration({
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
    targetId: integration.id,
    targetName: integration.channel,
    metadata: {
      channel: integration.channel,
    },
  });

  return NextResponse.json(integration, { status: 201, headers: rateLimitHeaders(rl) });
});

export const DELETE = withApiErrorHandling("slack_disconnect_failed", async () => {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!canManageIntegrations(session.user.role)) {
    return NextResponse.json(
      { error: "Only workspace owners or admins can manage Slack integrations." },
      { status: 403 },
    );
  }

  const rl = await checkRateLimit(session.user.organizationId, "api");

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "API rate limit exceeded", retryAfter: 60 },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

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

  return NextResponse.json({ ok: true }, { status: 200, headers: rateLimitHeaders(rl) });
});
