import { SectionCard } from "@/components/dashboard/section-card";
import { requireAuthSession } from "@/lib/auth-session";
import { formatPercent, formatSigned } from "@/lib/format";
import { getWorkspaceData } from "@/lib/workspace-data";

function evalClass(status: string): string {
  switch (status) {
    case "Passing":
      return "pill success";
    case "Watch":
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
        <span className="pill">Next build: run suites against model snapshots</span>
      </div>

      <SectionCard
        title="Benchmark results"
        description="A training platform only earns trust if model quality is visible."
        action={`${evals.length} suites`}
      >
        <div className="list">
          {evals.map((evalRun) => (
            <article key={evalRun.id} className="list-item">
              <div className="list-copy">
                <h3>{evalRun.name}</h3>
                <p className="muted">
                  {evalRun.benchmark} • {evalRun.judge}
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
      </SectionCard>

      <div className="page-grid two-column">
        <SectionCard
          title="Scorecard design"
          description="Keep the first eval product simple enough to trust and strict enough to block bad releases."
          action="V1 plan"
        >
          <ol className="checklist">
            <li>Define fixed benchmark suites per project or use case.</li>
            <li>Run candidate models against the same prompt set.</li>
            <li>Store raw outputs, rubric scores, and reviewer notes.</li>
            <li>Block promotion when safety or groundedness regresses.</li>
          </ol>
        </SectionCard>

        <SectionCard
          title="What to ship next"
          description="This is where the app moves from dashboard to decision engine."
          action="Execution"
        >
          <div className="mini-grid">
            <article className="panel mini-card">
              <p className="eyebrow">Automated judges</p>
              <h3>Start with rubric prompts plus human spot checks for trust.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Regression gates</p>
              <h3>Refuse export if critical benchmarks fall below a threshold.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Human review</p>
              <h3>Let teams approve borderline results before rollout.</h3>
            </article>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
