"use server";

import { hash } from "bcryptjs";
import { z } from "zod";
import { errorResult, successResult } from "@/lib/action-state";
import { prisma } from "@/lib/prisma";
import { createWorkspaceUser } from "@/lib/onboarding";
import { logger } from "@/lib/logger";

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

  let existingUser;
  try {
    existingUser = await prisma.user.findUnique({
      where: {
        email: parsed.data.email.toLowerCase(),
      },
    });
  } catch (error) {
    logger.error({
      event: "signup_existing_user_lookup_failed",
      email: parsed.data.email.toLowerCase(),
      error: error instanceof Error ? error.message : String(error),
    });

    return errorResult(
      "We could not check your account yet. Please try again in a minute.",
      "Sign-up temporarily unavailable",
    );
  }

  if (existingUser) {
    return errorResult("An account with this email already exists. Please sign in instead.", "Account exists");
  }

  try {
    const passwordHash = await hash(parsed.data.password, 10);

    await createWorkspaceUser({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      workspaceName: parsed.data.workspaceName,
      inviteToken: parsed.data.inviteToken,
    });
  } catch (error) {
    logger.error({
      event: "signup_workspace_creation_failed",
      email: parsed.data.email.toLowerCase(),
      error: error instanceof Error ? error.message : String(error),
    });

    return errorResult(
      "We could not create your workspace yet. Please try again in a minute.",
      "Workspace creation failed",
    );
  }

  return successResult("Your account is ready. Sign in to open your workspace.", "Workspace created");
}
