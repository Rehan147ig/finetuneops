import { MetricCard } from "@/components/dashboard/metric-card";
import { SectionCard } from "@/components/dashboard/section-card";
import {
  activeProject,
  datasets,
  evals,
  jobs,
  metrics,
  milestones,
  reliabilityNotes,
  workspaceName,
} from "@/lib/mock-data";
import {
  formatHours,
  formatNumber,
  formatPercent,
  formatSigned,
} from "@/lib/format";

export default function HomePage() {
  return (
    <div className="page-grid">
      <section className="hero">
        <div className="hero-copy">
          <div>
            <p className="eyebrow">{workspaceName}</p>
            <h2>{activeProject}</h2>
          </div>
          <p className="muted">
            This is the first product slice: a multi-page workspace for dataset
            ops, training orchestration, and eval visibility. The UI is already
            shaped like a real SaaS so we can wire persistence, auth, billing,
            and workers into something customers can understand.
          </p>
          <div className="hero-actions">
            <span className="pill success">V1 focus: post-training teams</span>
            <span className="pill">Next: Prisma + auth + uploads</span>
          </div>
        </div>
        <div className="hero-side">
          <article className="panel mini-card">
            <p className="eyebrow">Current promise</p>
            <h3>Fine-tune and evaluate custom LLMs without messy GPU workflows.</h3>
          </article>
          <article className="panel mini-card">
            <p className="eyebrow">Revenue path</p>
            <h3>Starter plan plus managed compute markup and beta onboarding.</h3>
          </article>
        </div>
      </section>

      <section className="metric-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <div className="page-grid two-column">
        <SectionCard
          title="Recent datasets"
          description="Data versioning is the heart of the product."
          action="3 tracked"
        >
          <div className="list">
            {datasets.map((dataset) => (
              <article key={dataset.id} className="list-item">
                <div className="list-copy">
                  <h3>{dataset.name}</h3>
                  <p className="muted">
                    {dataset.source} • updated {dataset.lastUpdated}
                  </p>
                  <div className="list-meta">
                    <span className="pill">{dataset.version}</span>
                    <span
                      className={
                        dataset.status === "Ready"
                          ? "pill success"
                          : dataset.status === "Processing"
                            ? "pill"
                            : "pill warning"
                      }
                    >
                      {dataset.status}
                    </span>
                  </div>
                </div>
                <div className="value-stack">
                  <strong>{formatNumber(dataset.rows)} rows</strong>
                  <span className="muted">
                    {formatPercent(dataset.quality)} quality
                  </span>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Build checklist"
          description="What turns this shell into a paid product."
          action="4 milestones"
        >
          <ol className="checklist">
            {milestones.map((milestone) => (
              <li key={milestone}>{milestone}</li>
            ))}
          </ol>
          <div className="callout panel">
            <p className="eyebrow">Why this matters</p>
            <p className="muted">
              We are intentionally building the boring, monetizable middle:
              datasets, jobs, evals, and reliability. That is where teams feel
              pain and where a SaaS can earn early revenue.
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="page-grid two-column">
        <SectionCard
          title="Training visibility"
          description="Track runs, GPU usage, checkpoints, and provider health."
          action="4 jobs"
        >
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Spend</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <strong>{job.name}</strong>
                    <div className="muted">{job.baseModel}</div>
                  </td>
                  <td>{job.status}</td>
                  <td>{job.provider}</td>
                  <td>{formatHours(job.gpuHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard
          title="Reliability notes"
          description="The product wins when it prevents wasted GPU time."
          action="High leverage"
        >
          <div className="mini-grid">
            {reliabilityNotes.map((note) => (
              <article key={note} className="panel mini-card">
                <p className="muted">{note}</p>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Eval pulse"
        description="Model quality needs a visible score before anyone deploys."
        action="3 benchmark suites"
      >
        <div className="list">
          {evals.map((evalRun) => (
            <article key={evalRun.id} className="list-item">
              <div className="list-copy">
                <h3>{evalRun.name}</h3>
                <p className="muted">
                  {evalRun.benchmark} • judged by {evalRun.judge}
                </p>
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
    </div>
  );
}
