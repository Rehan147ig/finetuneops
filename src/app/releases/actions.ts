"use server";

import { revalidatePath } from "next/cache";
import { errorResult, successResult, warningResult, type ActionResult } from "@/lib/action-state";
import { prisma } from "@/lib/prisma";
import { generateReviewToken, getReviewLinkExpiry, isReviewLinkExpired } from "@/lib/review-links";
import { getDefaultUserId, recordActivityEvent } from "@/lib/workspace-data";
import { canAdvanceRelease } from "@/lib/workflow-rules";

export async function advanceReleaseAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const releaseId = String(formData.get("releaseId") || "");

  if (!releaseId) {
    return errorResult("Release id is required before promotion.");
  }

  const release = await prisma.modelRelease.findUnique({
    where: {
      id: releaseId,
    },
  });

  if (!release) {
    return errorResult("We could not find the release you tried to update.");
  }

  const transition = canAdvanceRelease({
    status: release.status,
    qualityGate: release.qualityGate,
    latencyGate: release.latencyGate,
    costGate: release.costGate,
  });

  if (!transition.allowed) {
    return warningResult(transition.error);
  }

  const nextStatus = transition.nextStatus;
  const updatedRelease = await prisma.modelRelease.update({
    where: {
      id: releaseId,
    },
    data: {
      status: nextStatus,
      approvedBy: "Ops review",
    },
  });

  if (nextStatus === "approved") {
    await recordActivityEvent({
      projectId: release.projectId,
      type: "release_approved",
      message: `${updatedRelease.name} was approved for ${updatedRelease.channel}`,
      userId: await getDefaultUserId(release.projectId),
      metadata: {
        releaseId: updatedRelease.id,
        channel: updatedRelease.channel,
        status: nextStatus,
      },
    });
  }

  revalidatePath("/");
  revalidatePath("/releases");

  return successResult(
    nextStatus === "approved"
      ? `${updatedRelease.name} is approved and ready for the next gate.`
      : `${updatedRelease.name} is now live on ${updatedRelease.channel}.`,
    nextStatus === "approved" ? "Release approved" : "Release promoted",
  );
}

export async function createReviewLinkAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const releaseId = String(formData.get("releaseId") || "");

  if (!releaseId) {
    return errorResult("Release id is required before generating a review link.");
  }

  const release = await prisma.modelRelease.findUnique({
    where: {
      id: releaseId,
    },
    include: {
      reviewLinks: true,
    },
  });

  if (!release) {
    return errorResult("We could not find the release you want to share.");
  }

  const activeLink = release.reviewLinks.find((link) => {
    return !isReviewLinkExpired({
      expiresAt: link.expiresAt,
      decidedAt: link.decidedAt,
    });
  });

  if (activeLink) {
    return warningResult("An active review link already exists for this release.");
  }

  const createdAt = new Date();
  const reviewLink = await prisma.reviewLink.create({
    data: {
      releaseId: release.id,
      token: generateReviewToken(),
      expiresAt: getReviewLinkExpiry(createdAt),
      createdAt,
    },
  });

  revalidatePath("/releases");
  revalidatePath(`/review/${reviewLink.token}`);

  return successResult(
    `Share /review/${reviewLink.token} with reviewers before ${reviewLink.expiresAt.toLocaleDateString("en-US")}.`,
    "Review link created",
  );
}

export async function decideReviewLinkAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const token = String(formData.get("token") || "");
  const decision = String(formData.get("decision") || "");
  const reviewerName = String(formData.get("reviewerName") || "").trim() || "External reviewer";
  const approverNotes = String(formData.get("approverNotes") || "").trim();

  if (!token) {
    return errorResult("Review token is required.");
  }

  if (decision !== "approved" && decision !== "changes_requested") {
    return errorResult("Choose either approve or request changes.");
  }

  const reviewLink = await prisma.reviewLink.findUnique({
    where: {
      token,
    },
    include: {
      release: true,
    },
  });

  if (!reviewLink) {
    return errorResult("This review link does not exist anymore.");
  }

  if (
    isReviewLinkExpired({
      expiresAt: reviewLink.expiresAt,
      decidedAt: reviewLink.decidedAt,
    })
  ) {
    return warningResult("This review link has already expired or has been used.");
  }

  const decidedAt = new Date();
  await prisma.reviewLink.update({
    where: {
      id: reviewLink.id,
    },
    data: {
      decision,
      reviewerName,
      approverNotes,
      decidedAt,
    },
  });

  const releaseStatus = decision === "approved" ? "approved" : "gated";
  const approvedBy = decision === "approved" ? reviewerName : "Changes requested";

  await prisma.modelRelease.update({
    where: {
      id: reviewLink.releaseId,
    },
    data: {
      status: releaseStatus,
      approvedBy,
    },
  });

  await recordActivityEvent({
    projectId: reviewLink.release.projectId,
    type: decision === "approved" ? "release_approved" : "release_rejected",
    message:
      decision === "approved"
        ? `${reviewLink.release.name} was approved through a public review link`
        : `${reviewLink.release.name} needs changes before promotion`,
    userId: reviewerName,
    metadata: {
      releaseId: reviewLink.releaseId,
      reviewer: reviewerName,
    },
  });

  revalidatePath("/releases");
  revalidatePath(`/review/${token}`);

  return successResult(
    decision === "approved"
      ? "The release has been approved and recorded."
      : "Change request recorded. The release remains gated.",
    decision === "approved" ? "Release approved" : "Changes requested",
  );
}
