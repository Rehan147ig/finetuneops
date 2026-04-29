import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { logAuditEvent } from "@/lib/audit";
import { canTriggerOperations } from "@/lib/authz";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { reindexSearchDocuments } from "@/lib/search-data";

export const POST = withApiErrorHandling("search_reindex_failed", async () => {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!canTriggerOperations(session.user.role)) {
    return NextResponse.json(
      { error: "Only workspace owners or admins can reindex search." },
      { status: 403 },
    );
  }

  const rl = await checkRateLimit(session.user.organizationId, "admin");

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "API rate limit exceeded", retryAfter: 60 },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const stats = await reindexSearchDocuments(session.user.organizationId);

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "search_index_reindexed",
    targetType: "search_index",
    targetName: "workspace_search",
    metadata: {
      publicDocuments: stats.publicDocuments,
      workspaceDocuments: stats.workspaceDocuments,
    },
  });

  return NextResponse.json(stats, { status: 200, headers: rateLimitHeaders(rl) });
});
