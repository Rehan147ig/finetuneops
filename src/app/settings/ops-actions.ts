"use server";

import { revalidatePath } from "next/cache";
import { errorResult, successResult, type ActionResult } from "@/lib/action-state";
import { requireWorkspaceManager } from "@/lib/auth-session";
import { logAuditEvent } from "@/lib/audit";
import { reindexSearchDocuments } from "@/lib/search-data";

export async function reindexSearchAction(
  _previousState: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  const session = await requireWorkspaceManager();

  try {
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

    revalidatePath("/settings");
    return successResult(
      `Search index refreshed. ${stats.workspaceDocuments} workspace documents are now searchable.`,
      "Search index updated",
    );
  } catch {
    return errorResult("Search reindex failed. Check database connectivity and try again.");
  }
}
