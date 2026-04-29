import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { logAuditEvent } from "@/lib/audit";
import { canManageIntegrations } from "@/lib/authz";
import { deactivateProviderCredential } from "@/lib/provider-credentials";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const DELETE = withApiErrorHandling("credential_delete_failed", async (_request: Request, context?: unknown) => {
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

  const credential = await deactivateProviderCredential(id, session.user.organizationId);

  if (!credential) {
    return NextResponse.json({ error: "Credential not found." }, { status: 404 });
  }

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "provider_credential_deactivated",
    targetType: "provider_credential",
    targetId: id,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
});
