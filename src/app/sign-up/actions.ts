"use server";

import { hash } from "bcryptjs";
import { z } from "zod";
import { errorResult, successResult } from "@/lib/action-state";
import { prisma } from "@/lib/prisma";
import { createWorkspaceUser } from "@/lib/onboarding";

const signUpSchema = z.object({
  name: z.string().min(2, "Add your full name."),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  workspaceName: z.string().optional(),
  inviteToken: z.string().optional(),
});

export async function signUpAction(_: unknown, formData: FormData) {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    workspaceName: formData.get("workspaceName") || undefined,
    inviteToken: formData.get("inviteToken") || undefined,
  });

  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? "Invalid sign-up details.", "Sign-up failed");
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email: parsed.data.email.toLowerCase(),
    },
  });

  if (existingUser) {
    return errorResult("An account with this email already exists. Please sign in instead.", "Account exists");
  }

  const passwordHash = await hash(parsed.data.password, 10);

  await createWorkspaceUser({
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash,
    workspaceName: parsed.data.workspaceName,
    inviteToken: parsed.data.inviteToken,
  });

  return successResult("Your account is ready. Sign in to open your workspace.", "Workspace created");
}
