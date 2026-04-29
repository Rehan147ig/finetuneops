import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { logAuditEvent } from "@/lib/audit";
import { canManageIntegrations } from "@/lib/authz";
import {
  createProviderCredential,
  isProviderName,
  listProviderCredentials,
} from "@/lib/provider-credentials";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const GET = withApiErrorHandling("credentials_list_failed", async () => {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!canManageIntegrations(session.user.role)) {
    return NextResponse.json(
      { error: "Only workspace owners or admins can manage provider credentials." },
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

  const credentials = await listProviderCredentials(session.user.organizationId);
  return NextResponse.json(credentials, { status: 200, headers: rateLimitHeaders(rl) });
});

export const POST = withApiErrorHandling("credential_create_failed", async (request: Request) => {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!canManageIntegrations(session.user.role)) {
    return NextResponse.json(
      { error: "Only workspace owners or admins can manage provider credentials." },
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
  const provider = typeof parsedBody.provider === "string" ? parsedBody.provider : "";
  const label = typeof parsedBody.label === "string" ? parsedBody.label.trim() : "";
  const apiKey = typeof parsedBody.apiKey === "string" ? parsedBody.apiKey.trim() : "";

  if (!isProviderName(provider)) {
    return NextResponse.json(
      { error: "Provider must be one of: openai, anthropic, huggingface." },
      { status: 400 },
    );
  }

  if (!label) {
    return NextResponse.json({ error: "Label is required." }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: "API key must be a non-empty string." }, { status: 400 });
  }

  const credential = await createProviderCredential({
    workspaceId: session.user.organizationId,
    provider,
    label,
    apiKey,
    createdBy: session.user.id,
  });

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "provider_credential_created",
    targetType: "provider_credential",
    targetId: credential.id,
    targetName: `${provider}:${label}`,
    metadata: {
      provider,
      label,
    },
  });

  return NextResponse.json(credential, { status: 201, headers: rateLimitHeaders(rl) });
});
