import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { logAuditEvent } from "@/lib/audit";
import { canManageIntegrations } from "@/lib/authz";
import { testProviderCredential } from "@/lib/provider-credentials";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const POST = withApiErrorHandling("credential_test_failed", async (_request: Request, context?: unknown) => {
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

  const { id } = await (context as RouteContext).params;
  const result = await testProviderCredential(id, session.user.organizationId);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
      },
      { status: result.error === "Credential not found" ? 404 : 200 },
    );
  }

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "provider_credential_tested",
    targetType: "provider_credential",
    targetId: id,
    metadata: {
      ok: true,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
});
