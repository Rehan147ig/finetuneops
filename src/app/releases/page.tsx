import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { advanceReleaseAction, createReviewLinkAction } from "@/app/releases/actions";
import { ActionForm, ActionSubmitButton } from "@/components/feedback/action-form";
import { requireAuthSession } from "@/lib/auth-session";
import { getWorkspaceData } from "@/lib/workspace-data";

function releaseClass(status: string): string {
  switch (status) {
    case "Live":
      return "pill success";
    case "Approved":
      return "pill";
    default:
      return "pill warning";
  }
}

export default async function ReleasesPage() {
  const session = await requireAuthSession();
  const { releases } = await getWorkspaceData({
    organizationId: session.user.organizationId,
  });

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Releases</p>
          <h2>Promote only when the gates say the model is ready</h2>
        </div>
        <span className="pill success">Quality, latency, and cost gates</span>
      </div>

      <SectionCard
        title="Release channels"
        description="This is where post-training work turns into a production decision."
        action={`${releases.length} releases`}
      >
        <div className="list">
          {releases.map((release) => (
            <article key={release.id} className="list-item">
              <div className="list-copy">
                <h3>{release.name}</h3>
                <p className="muted">
                  {release.channel} channel • approved by {release.approvedBy}
                </p>
                <div className="list-meta">
                  <span className={releaseClass(release.status)}>{release.status}</span>
                  <span className="pill">Quality: {release.qualityGate}</span>
                  <span className="pill">Latency: {release.latencyGate}</span>
                  <span className="pill">Cost: {release.costGate}</span>
                </div>
              </div>
              <div className="mini-grid">
                <div className="value-stack">
                  <strong>{release.status}</strong>
                </div>
                <ActionForm action={createReviewLinkAction}>
                  <input name="releaseId" type="hidden" value={release.id} />
                  <ActionSubmitButton
                    idleLabel={release.reviewLinkToken ? "Review link active" : "Generate review link"}
                    pendingLabel="Generating..."
                    className="secondary-button"
                  />
                </ActionForm>
                {release.reviewLinkToken ? (
                  <Link href={`/review/${release.reviewLinkToken}`} className="pill success">
                    Open review link
                  </Link>
                ) : release.reviewLinkStatus === "decided" ? (
                  <span className="pill">Review completed</span>
                ) : release.reviewLinkStatus === "expired" ? (
                  <span className="pill warning">Review expired</span>
                ) : null}
                {release.status !== "Live" ? (
                  <ActionForm action={advanceReleaseAction}>
                    <input name="releaseId" type="hidden" value={release.id} />
                    <ActionSubmitButton
                      idleLabel={release.status === "Gated" ? "Approve release" : "Promote live"}
                      pendingLabel={release.status === "Gated" ? "Approving..." : "Promoting..."}
                    />
                  </ActionForm>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="page-grid two-column">
        <SectionCard
          title="Promotion policy"
          description="The platform should be opinionated here because this is where mistakes get expensive."
          action="Guardrails"
        >
          <ol className="checklist">
            <li>Never promote a candidate with a regressed critical benchmark.</li>
            <li>Block release if cost grows faster than quality improvement.</li>
            <li>Require human approval when safety or latency is borderline.</li>
            <li>Keep release history tied back to the experiment and training run.</li>
          </ol>
        </SectionCard>

        <SectionCard
          title="Buyer value"
          description="Release gating is one of the strongest reasons a team will keep paying."
          action="Sticky workflow"
        >
          <div className="mini-grid">
            <article className="panel mini-card">
              <p className="eyebrow">Fewer outages</p>
              <h3>Teams stop shipping models on gut feel alone.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Audit trail</p>
              <h3>Every promotion is backed by data, not a Slack thread.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Confidence</p>
              <h3>Model owners can explain why a release was approved or blocked.</h3>
            </article>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
