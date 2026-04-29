"use server";

import { z } from "zod";
import { createWorkspaceApiKey, revokeWorkspaceApiKey } from "@/lib/api-keys";
import { requireWorkspaceManager } from "@/lib/auth-session";
import { logAuditEvent } from "@/lib/audit";
import { errorResult, successResult, warningResult } from "@/lib/action-state";
import { canAddTeamMember } from "@/lib/billing";
import { createWorkspaceInvite, sendWorkspaceInvitationEmail } from "@/lib/invitations";
import { prisma } from "@/lib/prisma";

const inviteSchema = z.object({
  email: z.string().email("Enter a valid teammate email."),
  role: z.enum(["admin", "engineer", "reviewer", "viewer"]),
});

const apiKeySchema = z.object({
  name: z.string().min(2, "Add a name for this API key."),
});

export async function inviteMemberAction(_: unknown, formData: FormData) {
  const session = await requireWorkspaceManager();
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? "Invalid invite details.");
  }

  const existingMember = await prisma.user.findUnique({
    where: {
      email: parsed.data.email.toLowerCase(),
    },
  });

  if (existingMember?.organizationId === session.user.organizationId) {
    return warningResult("That teammate is already in this workspace.");
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: {
      id: session.user.organizationId,
    },
    include: {
      users: true,
    },
  });
  const memberGate = canAddTeamMember(organization.billingPlan, organization.users.length);

  if (!memberGate.allowed) {
    return warningResult(memberGate.reason ?? "This plan cannot add another teammate right now.");
  }

  const invite = await createWorkspaceInvite({
    organizationId: session.user.organizationId,
    invitedByUserId: session.user.id,
    email: parsed.data.email,
    role: parsed.data.role,
  });

  const emailResult = await sendWorkspaceInvitationEmail({
    to: invite.email,
    organizationName: organization.name,
    inviterName: session.user.name ?? "A teammate",
    inviteLink: `${process.env.APP_URL ?? "http://localhost:3000"}/sign-up?invite=${invite.token}`,
    role: invite.role,
  });

  if (!emailResult.sent) {
    return warningResult(emailResult.message, "Invite created");
  }

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "workspace_invite_created",
    targetType: "workspace_invite",
    targetId: invite.id,
    targetName: invite.email,
    metadata: {
      role: invite.role,
    },
  });

  return successResult(`Invitation sent to ${invite.email}.`, "Teammate invited");
}

export async function createApiKeyAction(_: unknown, formData: FormData) {
  const session = await requireWorkspaceManager();
  const parsed = apiKeySchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? "Invalid API key details.");
  }

  const { plaintext } = await createWorkspaceApiKey({
    organizationId: session.user.organizationId,
    createdByUserId: session.user.id,
    name: parsed.data.name,
    live: true,
  });

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "api_key_created",
    targetType: "api_key",
    targetName: parsed.data.name,
  });

  return successResult(`Copy this key now: ${plaintext}`, "API key created");
}

export async function revokeApiKeyAction(_: unknown, formData: FormData) {
  const session = await requireWorkspaceManager();
  const apiKeyId = String(formData.get("apiKeyId") ?? "");

  if (!apiKeyId) {
    return errorResult("Choose an API key to revoke.");
  }

  await revokeWorkspaceApiKey(apiKeyId, session.user.organizationId);

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "api_key_revoked",
    targetType: "api_key",
    targetId: apiKeyId,
  });

  return successResult("The API key has been revoked.", "API key revoked");
}
