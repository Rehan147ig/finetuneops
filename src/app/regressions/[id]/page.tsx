import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/dashboard/section-card";
import { ActionForm, ActionSubmitButton } from "@/components/feedback/action-form";
import { requireAuthSession } from "@/lib/auth-session";
import { formatPercent } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { dismissRegressionAction, investigateRegressionAction, applyRecoveryAction } from "../actions";

export default async function RegressionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuthSession();
  const { id } = await params;

  const alert = await prisma.regressionAlert.findFirst({
    where: {
      id,
      organizationId: session.user.organizationId,
    },
    include: {
      project: true,
      baselineRun: true,
      candidateRun: true,
      traReport: {
        include: {
          suspiciousExamples: {
            orderBy: { confidence: "desc" },
          },
          recoveryJob: true,
        },
      },
    },
  });

  if (!alert) {
    notFound();
  }

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <Link href="/regressions" className="muted mb-2 inline-block">
            &larr; Back to regressions
          </Link>
          <p className="eyebrow">{alert.project.name} Regression</p>
          <h2>{alert.metric} dropped by {Math.abs(alert.delta).toFixed(2)}</h2>
        </div>
        <div className="auth-actions">
          {alert.status !== "dismissed" && (
            <ActionForm action={dismissRegressionAction}>
              <input name="alertId" type="hidden" value={alert.id} />
              <ActionSubmitButton idleLabel="Dismiss" pendingLabel="Dismissing..." />
            </ActionForm>
          )}
          {alert.status !== "investigating" && (
            <ActionForm action={investigateRegressionAction}>
              <input name="alertId" type="hidden" value={alert.id} />
              <ActionSubmitButton idleLabel="Investigate" pendingLabel="Updating..." />
            </ActionForm>
          )}
        </div>
      </div>

      <div className="metric-grid">
        <article className="panel metric-card">
          <p className="eyebrow">Severity</p>
          <h3>{alert.severity}</h3>
          <p className="muted">Status: {alert.status}</p>
        </article>
        <article className="panel metric-card">
          <p className="eyebrow">Baseline Score</p>
          <h3>{alert.baselineScore.toFixed(2)}</h3>
          <p className="muted">Run: {alert.baselineRun.name}</p>
        </article>
        <article className="panel metric-card">
          <p className="eyebrow">Candidate Score</p>
          <h3>{alert.candidateScore.toFixed(2)}</h3>
          <p className="muted">Run: {alert.candidateRun.name}</p>
        </article>
        <article className="panel metric-card">
          <p className="eyebrow">Delta</p>
          <h3>{alert.delta.toFixed(2)}</h3>
          <p className="muted">Performance drop</p>
        </article>
      </div>

      {alert.traReport ? (
        <>
          <SectionCard
            title="TRA Report"
            description="Automated analysis of the regression root cause."
            action={`Confidence: ${formatPercent(alert.traReport.confidence)}`}
          >
            <div className="panel mb-6">
              <p className="eyebrow">Summary</p>
              <p className="mb-4">{alert.traReport.summary}</p>
              
              <p className="eyebrow">Root Cause Category</p>
              <p className="mb-4">{alert.traReport.rootCauseCategory}</p>

              <p className="eyebrow">Recommended Action</p>
              <p>{alert.traReport.recommendedAction}</p>
              <p className="muted mt-2">
                Impact Rating: <strong>{alert.traReport.impactRating}</strong>
              </p>
            </div>

            <div className="panel mb-6">
              <p className="eyebrow mb-4">One-Click Dataset Cleanup</p>
              {!alert.traReport.recoveryJob && (
                <ActionForm action={applyRecoveryAction}>
                  <input type="hidden" name="traReportId" value={alert.traReport.id} />
                  <ActionSubmitButton idleLabel="Clean Dataset" pendingLabel="Building Dataset..." />
                </ActionForm>
              )}
              {(alert.traReport.recoveryJob?.status === "PENDING" || alert.traReport.recoveryJob?.status === "RUNNING") && (
                <p className="muted">Recovery in progress... <span className="animate-pulse">⏳</span></p>
              )}
              {alert.traReport.recoveryJob?.status === "RETRAINING" && (
                <div>
                  <p className="text-green-600 mb-2">✓ Clean dataset built — retrain in progress</p>
                  <p className="muted mb-3">
                    Removed {alert.traReport.recoveryJob.removedExampleCount} suspicious examples and
                    queued a retrain on the clean dataset. The regression will be re-tested automatically
                    when the new eval completes.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Link href={`/datasets/${alert.traReport.recoveryJob.newDatasetId}`} className="button">
                      View Cleaned Dataset
                    </Link>
                    {alert.traReport.recoveryJob.retrainJobId && (
                      <Link href="/jobs" className="secondary-button">
                        View Retrain Job
                      </Link>
                    )}
                  </div>
                </div>
              )}
              {alert.traReport.recoveryJob?.status === "COMPLETE" && (
                <div>
                  <p className="text-green-600 mb-2">✓ Recovery verified</p>
                  <Link href={`/datasets/${alert.traReport.recoveryJob.newDatasetId}`} className="button">
                    View Cleaned Dataset
                  </Link>
                </div>
              )}
              {alert.traReport.recoveryJob?.status === "FAILED" && (
                <div>
                  <p className="text-red-600 mb-2">❌ Recovery failed: {alert.traReport.recoveryJob.error}</p>
                  <ActionForm action={applyRecoveryAction}>
                    <input type="hidden" name="traReportId" value={alert.traReport.id} />
                    <ActionSubmitButton idleLabel="Retry Recovery" pendingLabel="Starting Recovery..." />
                  </ActionForm>
                </div>
              )}
            </div>
            
            <p className="eyebrow mb-2">Top Suspicious Examples ({alert.traReport.suspiciousExamples.length})</p>
            <p className="muted mb-4" style={{ fontSize: "0.8em", opacity: 0.85 }}>
              TRA does not scan every row exhaustively. Label-noise detection samples up to 200 rows,
              instruction-conflict detection runs in batches of 8, duplicate detection is O(N·K)
              optimized but capped above 10,000 rows, and class-imbalance is statistical. Only the top
              10 ranked examples are shown. For large datasets this is a sample, not a full audit.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Index</th>
                  <th>Category</th>
                  <th>Confidence</th>
                  <th>Reason</th>
                  <th>Impact</th>
                </tr>
              </thead>
              <tbody>
                {alert.traReport.suspiciousExamples.map((ex) => (
                  <tr key={ex.id}>
                    <td>{ex.exampleIndex}</td>
                    <td>{ex.category}</td>
                    <td>{formatPercent(ex.confidence)}</td>
                    <td>{ex.reason}</td>
                    <td>{ex.impactScore.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </>
      ) : (
        <SectionCard
          title="Analysis Pending"
          description="TRA has not yet analyzed this regression."
          action="Pending"
        >
          <p className="muted">Click &ldquo;Analyze with TRA&rdquo; from the main regressions page to run the analysis.</p>
        </SectionCard>
      )}
    </div>
  );
}
