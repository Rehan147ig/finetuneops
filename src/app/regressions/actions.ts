"use server";

import { revalidatePath } from "next/cache";
import { errorResult, successResult, type ActionResult } from "@/lib/action-state";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { requireAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export async function analyzeRegressionAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAuthSession();
  const alertId = String(formData.get("alertId") ?? "");

  if (!alertId) {
    return errorResult("Alert ID is required.");
  }

  const alert = await prisma.regressionAlert.findFirst({
    where: {
      id: alertId,
      organizationId: session.user.organizationId,
    },
  });

  if (!alert) {
    return errorResult("Regression alert not found.");
  }

  await enqueueBackgroundJob({
    organizationId: session.user.organizationId,
    projectId: alert.projectId,
    jobType: "run-tra-analysis",
    payload: {
      regressionAlertId: alert.id,
    },
    estimatedCompletionAt: new Date(Date.now() + 1000 * 60 * 2),
  });

  revalidatePath("/regressions");
  revalidatePath(`/regressions/${alert.id}`);

  return successResult("TRA analysis queued successfully.", "Analysis started");
}

export async function dismissRegressionAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAuthSession();
  const alertId = String(formData.get("alertId") ?? "");

  if (!alertId) {
    return errorResult("Alert ID is required.");
  }

  const alert = await prisma.regressionAlert.findFirst({
    where: {
      id: alertId,
      organizationId: session.user.organizationId,
    },
  });

  if (!alert) {
    return errorResult("Regression alert not found.");
  }

  await prisma.regressionAlert.update({
    where: { id: alert.id },
    data: { status: "dismissed" },
  });

  revalidatePath("/regressions");
  revalidatePath(`/regressions/${alert.id}`);

  return successResult("Regression alert has been dismissed.", "Alert dismissed");
}

export async function investigateRegressionAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAuthSession();
  const alertId = String(formData.get("alertId") ?? "");

  if (!alertId) {
    return errorResult("Alert ID is required.");
  }

  const alert = await prisma.regressionAlert.findFirst({
    where: {
      id: alertId,
      organizationId: session.user.organizationId,
    },
  });

  if (!alert) {
    return errorResult("Regression alert not found.");
  }

  await prisma.regressionAlert.update({
    where: { id: alert.id },
    data: { status: "investigating" },
  });

  revalidatePath("/regressions");
  revalidatePath(`/regressions/${alert.id}`);

  return successResult("Regression alert marked as investigating.", "Alert updated");
}

export async function applyRecoveryAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAuthSession();
  const traReportId = String(formData.get("traReportId") ?? "");

  if (!traReportId) {
    return errorResult("TRA Report ID is required.");
  }

  const report = await prisma.traReport.findUnique({
    where: { id: traReportId },
    include: {
      regressionAlert: true,
    },
  });

  if (!report || report.regressionAlert.organizationId !== session.user.organizationId) {
    return errorResult("TRA report not found.");
  }

  await enqueueBackgroundJob({
    organizationId: session.user.organizationId,
    projectId: report.regressionAlert.projectId,
    jobType: "run-recovery-job",
    payload: {
      traReportId: report.id,
    },
  });

  revalidatePath(`/regressions/${report.regressionAlertId}`);

  return successResult("One-Click Recovery queued.", "Recovery started");
}
