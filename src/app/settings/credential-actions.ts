"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorResult, successResult, type ActionResult } from "@/lib/action-state";
import { requireWorkspaceManager } from "@/lib/auth-session";
import { logAuditEvent } from "@/lib/audit";
import {
  createProviderCredential,
  isProviderName,
  testProviderCredential,
  deactivateProviderCredential,
} from "@/lib/provider-credentials";

const credentialSchema = z.object({
  provider: z.string(),
  label: z.string().min(2, "Add a label for this credential."),
  apiKey: z.string().min(1, "Add an API key before saving."),
});

export async function createCredentialAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireWorkspaceManager();
  const parsed = credentialSchema.safeParse({
    provider: formData.get("provider"),
    label: formData.get("label"),
    apiKey: formData.get("apiKey"),
  });

  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? "Invalid credential details.");
  }

  if (!isProviderName(parsed.data.provider)) {
    return errorResult("Choose a supported provider.");
  }

  await createProviderCredential({
    workspaceId: session.user.organizationId,
    provider: parsed.data.provider,
    label: parsed.data.label,
    apiKey: parsed.data.apiKey,
    createdBy: session.user.id,
  });

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "provider_credential_created",
    targetType: "provider_credential",
    targetName: `${parsed.data.provider}:${parsed.data.label}`,
    metadata: {
      provider: parsed.data.provider,
      label: parsed.data.label,
    },
  });

  revalidatePath("/settings");
  return successResult("The provider credential was stored securely.", "Credential saved");
}

export async function testCredentialAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireWorkspaceManager();
  const credentialId = String(formData.get("credentialId") ?? "");

  if (!credentialId) {
    return errorResult("Choose a credential to test.");
  }

  const result = await testProviderCredential(credentialId, session.user.organizationId);
  revalidatePath("/settings");

  if (!result.ok) {
    return errorResult(result.error ?? "Connection test failed.");
  }

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "provider_credential_tested",
    targetType: "provider_credential",
    targetId: credentialId,
    metadata: {
      ok: true,
    },
  });

  return successResult("Connection verified successfully.", "Test passed");
}

export async function deleteCredentialAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireWorkspaceManager();
  const credentialId = String(formData.get("credentialId") ?? "");

  if (!credentialId) {
    return errorResult("Choose a credential to delete.");
  }

  const deleted = await deactivateProviderCredential(credentialId, session.user.organizationId);

  if (!deleted) {
    return errorResult("That credential was not found.");
  }

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "provider_credential_deactivated",
    targetType: "provider_credential",
    targetId: credentialId,
  });

  revalidatePath("/settings");
  return successResult("The credential was marked inactive.", "Credential removed");
}
