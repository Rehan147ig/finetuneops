export const workspaceRoles = ["owner", "admin", "engineer", "reviewer", "viewer"] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

const roleRank: Record<WorkspaceRole, number> = {
  owner: 5,
  admin: 4,
  engineer: 3,
  reviewer: 2,
  viewer: 1,
};

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return workspaceRoles.includes(value as WorkspaceRole);
}

export function hasWorkspaceRole(currentRole: string, minimumRole: WorkspaceRole) {
  if (!isWorkspaceRole(currentRole)) {
    return false;
  }

  return roleRank[currentRole] >= roleRank[minimumRole];
}

export function canManageWorkspace(currentRole: string) {
  return hasWorkspaceRole(currentRole, "admin");
}

export function canReviewRelease(currentRole: string) {
  return ["owner", "admin", "reviewer"].includes(currentRole);
}

export function canManageIntegrations(currentRole: string) {
  return ["owner", "admin"].includes(currentRole);
}

export function canManageApiKeys(currentRole: string) {
  return ["owner", "admin"].includes(currentRole);
}

export function canEditPrompts(currentRole: string) {
  return ["owner", "admin", "engineer"].includes(currentRole);
}

export function canDeployPrompts(currentRole: string) {
  return ["owner", "admin", "reviewer"].includes(currentRole);
}

export function canViewAuditLog(currentRole: string) {
  return ["owner", "admin"].includes(currentRole);
}

export function canTriggerOperations(currentRole: string) {
  return ["owner", "admin"].includes(currentRole);
}
