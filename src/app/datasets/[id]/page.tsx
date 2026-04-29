import { notFound } from "next/navigation";
import { ActionForm, ActionSubmitButton } from "@/components/feedback/action-form";
import { SectionCard } from "@/components/dashboard/section-card";
import { removeFlaggedExamplesAction } from "@/app/datasets/actions";
import { requireAuthSession } from "@/lib/auth-session";
import { formatCurrency, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getDatasetQualityReport } from "@/lib/workspace-data";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function scoreTone(score: number) {
  if (score >= 90) {
    return "#1f8f55";
  }
  if (score >= 70) {
    return "#b68a14";
  }
  if (score >= 50) {
    return "#c7661a";
  }
  return "#c23b3b";
}

function ringStyle(score: number) {
  const tone = scoreTone(score);
  return {
    background: `conic-gradient(${tone} ${score}%, rgba(255,255,255,0.12) ${score}% 100%)`,
  };
}

function badgeForCheck(ok: boolean, warningText: string, errorText: string) {
  return ok ? `OK - ${warningText}` : `Review - ${errorText}`;
}

export default async function DatasetDetailPage({ params }: PageProps) {
  const session = await requireAuthSession();
  const { id } = await params;
  const dataset = await prisma.dataset.findFirst({
    where: {
      id,
      project: {
        organizationId: session.user.organizationId,
      },
    },
    include: {
      examples: true,
      project: true,
    },
  });

  if (!dataset) {
    notFound();
  }

  const report = await getDatasetQualityReport(dataset.id);

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dataset report</p>
          <h2>{dataset.name} {dataset.version}</h2>
        </div>
        <span className="pill">{dataset.status}</span>
      </div>

      {!report ? (
        <SectionCard
          title="Quality report pending"
          description="This dataset has not been scored yet. The score-dataset background job will populate the health report when it finishes."
          action="Waiting on async worker"
        >
          <p className="muted">Examples currently tracked: {formatNumber(dataset.examples.length)}</p>
        </SectionCard>
      ) : (
        <>
          <div className="page-grid two-column">
            <SectionCard
              title="Dataset health"
              description="Health blends duplicates, PII, length, balance, and empty-output issues into a single readiness score."
              action={`${report.healthScore}/100`}
            >
              <div className="mini-grid">
                <div
                  className="panel mini-card"
                  style={{
                    ...ringStyle(report.healthScore),
                    borderRadius: "999px",
                    width: "180px",
                    height: "180px",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <div className="panel mini-card" style={{ width: "122px", height: "122px", borderRadius: "999px", display: "grid", placeItems: "center" }}>
                    <div className="value-stack">
                      <strong>{report.healthScore}</strong>
                      <span className="muted">health</span>
                    </div>
                  </div>
                </div>
                <article className="panel mini-card">
                  <p className="eyebrow">Recommendation</p>
                  <h3>{report.recommendation}</h3>
                  <p className="muted">
                    {formatNumber(report.goodExamples)} good examples out of {formatNumber(report.totalExamples)}
                  </p>
                </article>
              </div>
            </SectionCard>

            <SectionCard
              title="Cost impact"
              description="Cleaning low-quality examples is often cheaper than paying GPUs to learn from bad data."
              action="Training readiness"
            >
              <div className="mini-grid">
                <article className="panel mini-card">
                  <p className="eyebrow">Current cost</p>
                  <h3>{formatCurrency(report.estimatedCost)}</h3>
                  <p className="muted">Training cost with the current dataset</p>
                </article>
                <article className="panel mini-card">
                  <p className="eyebrow">Projected saving</p>
                  <h3>{formatCurrency(report.projectedSaving)}</h3>
                  <p className="muted">Potential saving after removing flagged examples</p>
                </article>
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Quality checks"
            description="Each check maps directly to cleanup actions before a fine-tune starts."
            action={`${formatNumber(dataset.examples.length)} examples`}
          >
            <div className="mini-grid">
              <article className="panel mini-card">
                <p className="eyebrow">Duplicates</p>
                <h3>{badgeForCheck(report.exactDuplicates === 0 && report.nearDuplicates === 0, "No duplicates found", `${report.exactDuplicates} exact and ${report.nearDuplicates} near duplicates`)}</h3>
              </article>
              <article className="panel mini-card">
                <p className="eyebrow">PII</p>
                <h3>{badgeForCheck(report.piiDetected === 0, "No PII detected", `${report.piiDetected} examples need review`)}</h3>
              </article>
              <article className="panel mini-card">
                <p className="eyebrow">Length</p>
                <h3>{badgeForCheck(report.tooShort + report.tooLong === 0, "Length distribution looks normal", `${report.tooShort + report.tooLong} examples are too short or too long`)}</h3>
              </article>
              <article className="panel mini-card">
                <p className="eyebrow">Outputs</p>
                <h3>{badgeForCheck(report.emptyOutputs === 0, "All outputs are populated", `${report.emptyOutputs} empty outputs need cleanup`)}</h3>
              </article>
            </div>
          </SectionCard>

          <SectionCard
            title="Cleanup actions"
            description="Each cleanup creates a new dataset version so the original stays preserved."
            action="One click"
          >
            <div className="auth-actions">
              <ActionForm action={removeFlaggedExamplesAction}>
                <input name="datasetId" type="hidden" value={dataset.id} />
                <input name="mode" type="hidden" value="exact_duplicates" />
                <ActionSubmitButton
                  idleLabel="Remove exact duplicates"
                  pendingLabel="Cleaning duplicates..."
                />
              </ActionForm>
              <ActionForm action={removeFlaggedExamplesAction}>
                <input name="datasetId" type="hidden" value={dataset.id} />
                <input name="mode" type="hidden" value="pii" />
                <ActionSubmitButton
                  idleLabel="Remove PII traces"
                  pendingLabel="Cleaning PII..."
                  className="secondary-button"
                />
              </ActionForm>
              <ActionForm action={removeFlaggedExamplesAction}>
                <input name="datasetId" type="hidden" value={dataset.id} />
                <input name="mode" type="hidden" value="all_flagged" />
                <ActionSubmitButton
                  idleLabel="Remove all flagged"
                  pendingLabel="Cleaning everything..."
                  className="secondary-button"
                />
              </ActionForm>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
