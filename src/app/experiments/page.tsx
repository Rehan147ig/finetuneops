import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { requireAuthSession } from "@/lib/auth-session";
import { buildExperimentMatrix } from "@/lib/experiment-matrix";
import { formatCurrency, formatCurrencyDetailed, formatPercent } from "@/lib/format";
import { getWorkspaceData } from "@/lib/workspace-data";

function statusClass(status: string): string {
  switch (status) {
    case "Promote":
      return "pill success";
    case "Review":
      return "pill warning";
    default:
      return "pill";
  }
}

export default async function ExperimentsPage() {
  const session = await requireAuthSession();
  const { datasets, experiments } = await getWorkspaceData({
    organizationId: session.user.organizationId,
  });
  const matrix = buildExperimentMatrix(
    experiments.map((experiment) => ({
      id: experiment.id,
      model: experiment.candidateModel,
      qualityScore: experiment.score,
      isFineTuned: (experiment.linkedJobCount ?? 0) > 0,
    })),
  );

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Experiments</p>
          <h2>Compare candidates before burning GPU money</h2>
        </div>
        <span className="pill">Prompts, models, retrieval, judges</span>
      </div>

      <SectionCard
        title="Candidate leaderboard"
        description="The fastest win usually comes from experiments, not training first."
        action={`${experiments.length} active`}
      >
        <div className="list">
          {experiments.map((experiment) => (
            <article key={experiment.id} className="list-item">
              <div className="list-copy">
                <h3>{experiment.name}</h3>
                <p className="muted">
                  {experiment.goal} • prompt {experiment.promptVersion}
                </p>
                <div className="list-meta">
                  <span className={statusClass(experiment.status)}>
                    {experiment.status}
                  </span>
                  <span className="pill">{experiment.candidateModel}</span>
                  {experiment.datasetName ? (
                    <span className="pill">{experiment.datasetName}</span>
                  ) : null}
                </div>
              </div>
              <div className="mini-grid">
                <div className="value-stack">
                  <strong>{formatPercent(experiment.score)}</strong>
                  <span className="muted">{formatCurrency(experiment.cost)}</span>
                  <span className="muted">
                    {experiment.linkedJobCount ?? 0} fine-tunes linked
                  </span>
                </div>
                {experiment.canLaunchFineTune ? (
                  <Link
                    href={`/jobs/estimate/${experiment.id}`}
                    className="primary-button"
                  >
                    Review cost estimate
                  </Link>
                ) : (
                  <span className="pill warning">Not ready for fine-tune</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Cost vs quality"
        description="Compare capability, latency, and spend before choosing what to ship."
        action={`${matrix.length} comparable candidates`}
      >
        <table className="table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Quality score</th>
              <th>Cost / 1K</th>
              <th>Latency p50</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.model}</strong>
                </td>
                <td>{formatPercent(row.qualityScore)}</td>
                <td>{formatCurrencyDetailed(row.costPer1kTokens)}</td>
                <td>{row.latencyP50} ms</td>
                <td>
                  <span
                    className={
                      row.verdict === "Best Value" || row.verdict === "Ship This"
                        ? "pill success"
                        : row.verdict === "Most Affordable"
                          ? "pill"
                          : "pill warning"
                    }
                  >
                    {row.verdict}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <div className="page-grid two-column">
        <SectionCard
          title="Launch queue"
          description="Good datasets should turn into candidate experiments with one action."
          action={`${datasets.filter((dataset) => dataset.status === "Ready").length} ready datasets`}
        >
          <div className="list">
            {datasets.slice(0, 3).map((dataset) => (
              <article key={dataset.id} className="list-item">
                <div className="list-copy">
                  <h3>{dataset.name}</h3>
                  <p className="muted">
                    {dataset.version} - {formatPercent(dataset.quality)} quality
                  </p>
                </div>
                <div className="value-stack">
                  <strong>{dataset.status}</strong>
                  <span className="muted">
                    {dataset.experimentCount ?? 0} experiments so far
                  </span>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Experiment rules"
          description="This is how the product earns trust with technical teams."
          action="Keep it disciplined"
        >
          <ol className="checklist">
            <li>Run every candidate against the same curated benchmark set.</li>
            <li>Track quality, latency, and cost together, not in separate tools.</li>
            <li>Only promote candidates that beat the current baseline.</li>
            <li>Fine-tune only when prompt and retrieval improvements plateau.</li>
          </ol>
        </SectionCard>

        <SectionCard
          title="Why this scales"
          description="Experiments widen the product beyond training specialists."
          action="Broader user base"
        >
          <div className="mini-grid">
            <article className="panel mini-card">
              <p className="eyebrow">Students</p>
              <h3>Learn with prompt and eval iteration before touching expensive GPUs.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Developers</p>
              <h3>Ship better models with less infrastructure pain and clearer evidence.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Teams</p>
              <h3>Standardize model decisions instead of arguing in dashboards and docs.</h3>
            </article>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
