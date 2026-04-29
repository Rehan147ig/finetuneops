import crypto from "node:crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

export function generateInvitationToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function isInviteExpired(expiresAt: Date) {
  return expiresAt.getTime() <= Date.now();
}

export async function createWorkspaceInvite(input: {
  organizationId: string;
  invitedByUserId: string;
  email: string;
  role: string;
}) {
  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  const invite = await prisma.workspaceInvite.create({
    data: {
      organizationId: input.organizationId,
      invitedByUserId: input.invitedByUserId,
      email: input.email.toLowerCase(),
      role: input.role,
      token,
      expiresAt,
    },
  });

  return invite;
}

export async function findActiveInviteByToken(token: string) {
  const invite = await prisma.workspaceInvite.findUnique({
    where: {
      token,
    },
    include: {
      organization: true,
    },
  });

  if (!invite || invite.acceptedAt || isInviteExpired(invite.expiresAt)) {
    return null;
  }

  return invite;
}

export async function markInviteAccepted(token: string) {
  return prisma.workspaceInvite.update({
    where: {
      token,
    },
    data: {
      acceptedAt: new Date(),
    },
  });
}

export async function sendWorkspaceInvitationEmail(input: {
  to: string;
  organizationName: string;
  inviterName: string;
  inviteLink: string;
  role: string;
}) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return {
      sent: false,
      message: "Invite created, but email delivery is disabled because Resend is not configured.",
    };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: [input.to],
    subject: `Join ${input.organizationName} on FineTuneOps`,
    html: `
      <p>${input.inviterName} invited you to join ${input.organizationName} as a ${input.role}.</p>
      <p><a href="${input.inviteLink}">Accept your invitation</a></p>
    `,
  });

  return {
    sent: true,
    message: "Invitation email sent.",
  };
}
