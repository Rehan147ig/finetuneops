import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { logAuditEvent } from "@/lib/audit";
import { canManageIntegrations } from "@/lib/authz";
import { testSlackIntegration } from "@/lib/slack";

export const POST = withApiErrorHandling("slack_test_failed", async () => {
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

  const result = await testSlackIntegration(session.user.organizationId);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
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

  return NextResponse.json(result, { status: 200 });
});
