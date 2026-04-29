import { ActionForm } from "@/components/feedback/action-form";
import { SectionCard } from "@/components/dashboard/section-card";
import { decideReviewLinkAction } from "@/app/releases/actions";
import { formatCurrencyDetailed, formatPercent } from "@/lib/format";
import { isReviewLinkExpired } from "@/lib/review-links";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

type ReviewPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { token } = await params;
  const reviewLink = await prisma.reviewLink.findUnique({
    where: {
      token,
    },
    include: {
      release: {
        include: {
          experiment: true,
          trainingJob: true,
          project: {
            include: {
              releases: {
                include: {
                  experiment: true,
                  trainingJob: true,
                },
                orderBy: {
                  createdAt: "desc",
                },
              },
            },
          },
        },
      },
    },
  });

  if (!reviewLink) {
    notFound();
  }

  const release = reviewLink.release;
  const previousRelease = release.project.releases.find((candidate) => {
    return candidate.id !== release.id && candidate.createdAt < release.createdAt;
  });
  const afterScore = release.experiment?.score ?? 0;
  const beforeScore = previousRelease?.experiment?.score ?? 0;
  const currentGpuCost = (release.trainingJob?.gpuHours ?? 0) * 110;
  const previousGpuCost = (previousRelease?.trainingJob?.gpuHours ?? 0) * 110;
  const costImpactLabel =
    currentGpuCost > previousGpuCost
      ? "More expensive than previous version"
      : currentGpuCost < previousGpuCost
        ? "Cheaper than previous version"
        : "Flat cost profile";
  const linkExpired = isReviewLinkExpired({
    expiresAt: reviewLink.expiresAt,
    decidedAt: reviewLink.decidedAt,
  });

  return (
    <div className="review-shell">
      <div className="page-grid">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Public review</p>
            <h2>{release.name}</h2>
          </div>
          <span className={linkExpired ? "pill warning" : "pill success"}>
            {linkExpired ? "Review closed" : "Review open"}
          </span>
        </div>

        <SectionCard
          title="Release summary"
          description="Everything a reviewer needs to decide without opening the full workspace."
          action={release.channel}
        >
          <div className="estimate-grid">
            <div className="estimate-summary panel">
              <div className="estimate-row">
                <span>What changed</span>
                <strong>
                  {previousRelease
                    ? `${previousRelease.name} -> ${release.name}`
                    : "First tracked release in this project"}
                </strong>
              </div>
              <div className="estimate-row">
                <span>Eval score before</span>
                <strong>{formatPercent(beforeScore)}</strong>
              </div>
              <div className="estimate-row">
                <span>Eval score after</span>
                <strong>{formatPercent(afterScore)}</strong>
              </div>
              <div className="estimate-row">
                <span>Cost impact</span>
                <strong>{costImpactLabel}</strong>
              </div>
              <div className="estimate-row">
                <span>GPU run cost</span>
                <strong>{formatCurrencyDetailed(currentGpuCost)}</strong>
              </div>
            </div>

            <div className="mini-grid">
              <article className="panel mini-card">
                <p className="eyebrow">Release gates</p>
                <h3>
                  Quality {release.qualityGate} | Latency {release.latencyGate} | Cost {release.costGate}
                </h3>
                <p className="muted">
                  This view stays public until the link expires or a reviewer records
                  a decision.
                </p>
              </article>
              {reviewLink.decision ? (
                <article className="panel mini-card">
                  <p className="eyebrow">Recorded decision</p>
                  <h3>{reviewLink.decision === "approved" ? "Approved" : "Changes requested"}</h3>
                  <p className="muted">
                    Reviewer: {reviewLink.reviewerName ?? "Unknown reviewer"}
                  </p>
                  {reviewLink.approverNotes ? (
                    <p className="muted">Notes: {reviewLink.approverNotes}</p>
                  ) : null}
                </article>
              ) : null}
            </div>
          </div>
        </SectionCard>

        {!linkExpired ? (
          <SectionCard
            title="Review decision"
            description="Approve the release or request changes with optional notes."
            action="No login required"
          >
            <ActionForm action={decideReviewLinkAction} className="page-grid">
              <input name="token" type="hidden" value={token} />
              <div className="page-grid two-column">
                <label className="mini-grid">
                  <span className="eyebrow">Reviewer name</span>
                  <input name="reviewerName" type="text" placeholder="Optional name" />
                </label>
                <label className="mini-grid">
                  <span className="eyebrow">Approver notes</span>
                  <textarea
                    name="approverNotes"
                    rows={4}
                    placeholder="Add context for the release owner"
                  />
                </label>
              </div>
              <div className="estimate-actions">
                <button className="primary-button" type="submit" name="decision" value="approved">
                  Approve Release
                </button>
                <button className="secondary-button" type="submit" name="decision" value="changes_requested">
                  Request Changes
                </button>
              </div>
            </ActionForm>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
