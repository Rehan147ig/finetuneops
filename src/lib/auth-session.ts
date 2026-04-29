import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canManageWorkspace, hasWorkspaceRole, type WorkspaceRole } from "@/lib/authz";

export async function getAuthSession() {
  return auth();
}

export async function requireAuthSession() {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    redirect("/sign-in");
  }

  return session;
}

export async function requireWorkspaceManager() {
  const session = await requireAuthSession();

  if (!canManageWorkspace(session.user.role)) {
    redirect("/");
  }

  return session;
}

export async function assertWorkspaceRole(minimumRole: WorkspaceRole) {
  const session = await requireAuthSession();

  if (!hasWorkspaceRole(session.user.role, minimumRole)) {
    redirect("/");
  }

  return session;
}
