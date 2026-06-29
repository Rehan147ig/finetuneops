import { SectionCard } from "@/components/dashboard/section-card";
import { requireAuthSession } from "@/lib/auth-session";
import { formatPercent, formatSigned } from "@/lib/format";
import { getWorkspaceData } from "@/lib/workspace-data";

function evalClass(status: string): string {
  switch (status) {
    case "completed":
      return "pill success";
    case "running":
    case "queued":
      return "pill warning";
    default:
      return "pill danger";
  }
}

export default async function EvalsPage() {
  const session = await requireAuthSession();
  const { evals } = await getWorkspaceData({
    organizationId: session.user.organizationId,
  });

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Evals</p>
          <h2>Decide whether a candidate is truly better before promotion</h2>
        </div>
        <button className="primary-button">Run new eval</button>
      </div>

      <SectionCard
        title="Benchmark results"
        description="A training platform only earns trust if model quality is visible."
        action={`${evals.length} suites`}
      >
        {evals.length === 0 ? (
          <div className="empty-state">
            <p className="muted">No evaluations have been run for this workspace yet.</p>
          </div>
        ) : (
          <div className="list">
            {evals.map((evalRun) => (
              <article key={evalRun.id} className="list-item">
                <div className="list-copy">
                  <h3>{evalRun.name}</h3>
                  <p className="muted">
                    {evalRun.benchmark} • {evalRun.judge || "No judge"}
                  </p>
                  <div className="list-meta">
                    <span className={evalClass(evalRun.status)}>
                      {evalRun.status}
                    </span>
                  </div>
                </div>
                <div className="value-stack">
                  <strong>{formatPercent(evalRun.score)}</strong>
                  <span
                    className={
                      evalRun.delta >= 0 ? "pill success" : "pill danger"
                    }
                  >
                    {formatSigned(evalRun.delta)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
