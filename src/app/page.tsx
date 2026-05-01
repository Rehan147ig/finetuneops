import Link from "next/link";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SectionCard } from "@/components/dashboard/section-card";
import {
  formatCurrency,
  formatHours,
  formatPercent,
  formatSigned,
} from "@/lib/format";
import { milestones, reliabilityNotes } from "@/lib/mock-data";
import { buildWorkspaceNudges } from "@/lib/nudge-engine";
import { requireAuthSession } from "@/lib/auth-session";
import { getWorkspaceData } from "@/lib/workspace-data";

const workflowNodes = [
  {
    title: "Capture",
    detail: "Log real production failures from your app or SDK.",
  },
  {
    title: "Curate",
    detail: "Promote useful traces into high-signal datasets.",
  },
  {
    title: "Evaluate",
    detail: "Compare prompts, models, latency, cost, and quality.",
  },
  {
    title: "Train",
    detail: "Launch fine-tunes only when data proves it is worth it.",
  },
  {
    title: "Release",
    detail: "Ship with gates, review links, analytics, and rollback context.",
  },
];

export default async function HomePage() {
  const session = await requireAuthSession();
  const {
    activeProject,
    activity,
    evals,
    experiments,
    jobs,
    metrics,
    releases,
    summary,
    traces,
    workflow,
    workspaceName,
  } = await getWorkspaceData({
    organizationId: session.user.organizationId,
  });
  const nudges = buildWorkspaceNudges({
    traces,
    experiments,
    jobs,
    evals,
    releases,
  });

  return (
    <div className="dashboard-layout">
      <div className="page-grid">
        <section className="hero">
          <div className="hero-orbit" aria-hidden="true" />
          <div className="hero-copy">
            <div>
              <p className="eyebrow">{workspaceName}</p>
              <h2>Turn messy LLM behavior into production-grade releases.</h2>
            </div>
            <p className="muted">
              FinetuneOps gives AI teams the operating system for improvement:
              capture failures, build datasets, version prompts, evaluate
              candidates, launch fine-tunes, and prove every release is safer
              before it reaches users.
            </p>
            <div className="hero-actions">
              <Link className="primary-button" href="/traces">
                Start capturing traces
              </Link>
              <Link className="secondary-button" href="/docs">
                Read launch docs
              </Link>
              <span className="pill success">Live: {activeProject}</span>
              <span className="pill">{summary.memberCount} members</span>
              <span className="pill">{summary.billingPlan} plan</span>
            </div>
          </div>

          <div className="hero-side">
            <article className="panel launch-panel">
              <p className="eyebrow">SDK install</p>
              <div className="launch-terminal">
                <div className="terminal-topbar">
                  <span className="terminal-dot" />
                  <span className="terminal-dot" />
                  <span className="terminal-dot" />
                </div>
                <pre className="terminal-code">{`npm install finetuneops

const ops = new FinetuneOps({
  apiKey: "fto_live_..."
})

await ops.trace({
  input,
  output,
  model: "gpt-4o-mini"
})`}</pre>
              </div>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Promise</p>
              <h3>Every failure becomes a reusable improvement asset.</h3>
              <p className="muted">
                Your team stops guessing why quality changed and starts shipping
                from evidence.
              </p>
            </article>
          </div>
        </section>

        <section className="metric-grid">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </section>

        <SectionCard
          title="Animated workflow"
          description="The repeatable loop that turns production data into better AI behavior."
          action="5-stage system"
        >
          <div className="workflow-rail" aria-label="FinetuneOps workflow">
            {workflowNodes.map((node, index) => (
              <article key={node.title} className="workflow-node">
                <span className="workflow-node-number">{index + 1}</span>
                <h3>{node.title}</h3>
                <p className="muted">{node.detail}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Product demo"
          description="A single workspace view for traces, prompt versions, evals, queue health, and cost signals."
          action="Investor-ready preview"
        >
          <div className="demo-showcase">
            <article className="panel demo-browser">
              <div className="demo-browser-top">
                <div className="terminal-topbar" aria-hidden="true">
                  <span className="terminal-dot" />
                  <span className="terminal-dot" />
                  <span className="terminal-dot" />
                </div>
                <span className="demo-url">app.finetuneops.com/workspace/production</span>
              </div>
              <div className="demo-browser-body">
                <div className="demo-chart">
                  <div className="demo-chart-bars" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                <div className="demo-snapshot-grid">
                  <div className="demo-snapshot">
                    <strong>{traces.length} traces</strong>
                    <span className="muted">ready to curate</span>
                  </div>
                  <div className="demo-snapshot">
                    <strong>{experiments.length} experiments</strong>
                    <span className="muted">ranked by quality</span>
                  </div>
                  <div className="demo-snapshot">
                    <strong>{releases.length} releases</strong>
                    <span className="muted">behind gates</span>
                  </div>
                </div>
              </div>
            </article>

            <div className="demo-card-stack">
              <article className="demo-float-card">
                <p className="eyebrow">Prompt memory</p>
                <h3>Know exactly which prompt is live.</h3>
                <p className="muted">
                  Version, compare, deploy, and review prompts without losing
                  tribal knowledge.
                </p>
              </article>
              <article className="demo-float-card">
                <p className="eyebrow">Backpressure</p>
                <h3>Protect ingestion during traffic spikes.</h3>
                <p className="muted">
                  Queue thresholds keep the system stable instead of letting
                  a surge break the pipeline.
                </p>
              </article>
              <article className="demo-float-card">
                <p className="eyebrow">Analytics</p>
                <h3>See quality, model mix, cost, and team activity.</h3>
                <p className="muted">
                  The dashboard tells the story of what improved and why.
                </p>
              </article>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Workflow"
          description="This is the operational loop customers will come back to every week."
          action="Live workspace"
        >
          <div className="workflow-grid">
            {workflow.map((stage) => (
              <article key={stage.title} className="panel stage-card">
                <p className="eyebrow">{stage.title}</p>
                <h3>{stage.status}</h3>
                <p className="muted">{stage.detail}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <div className="page-grid two-column">
          <SectionCard
            title="High-value traces"
            description="Start by fixing the failures that move the needle, not by labeling random data."
            action={`${traces.length} traces`}
          >
            <div className="list">
              {traces.map((trace) => (
                <article key={trace.id} className="list-item">
                  <div className="list-copy">
                    <h3>{trace.title}</h3>
                    <p className="muted">
                      {trace.source} - captured {trace.capturedAt}
                    </p>
                    <div className="list-meta">
                      <span className="pill">{trace.severity}</span>
                      <span
                        className={
                          trace.status === "Ready for curation"
                            ? "pill success"
                            : trace.status === "Triaged"
                              ? "pill"
                              : "pill warning"
                        }
                      >
                        {trace.status}
                      </span>
                    </div>
                  </div>
                  <div className="value-stack">
                    <strong>{trace.spanCount} spans</strong>
                    <span className="muted">
                      {formatPercent(trace.opportunity)} opportunity
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Workspace activity"
            description="Teams stay when they can see what changed without asking around."
            action={`${activity.length} recent events`}
          >
            <div className="list">
              {activity.map((item) => (
                <article key={item.id} className="list-item">
                  <div className="list-copy">
                    <h3>{item.title}</h3>
                    <p className="muted">{item.detail}</p>
                  </div>
                  <div className="value-stack">
                    <strong>{item.kind}</strong>
                    <span className="muted">{item.at}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="callout panel">
              <p className="eyebrow">Why this matters</p>
              <p className="muted">
                Teams retain when the tool becomes their shared memory for model
                decisions, regressions, and releases rather than another page
                they only open during emergencies.
              </p>
            </div>
          </SectionCard>
        </div>

        <div className="page-grid two-column">
          <SectionCard
            title="Experiment leaderboard"
            description="Most teams should experiment before they fine-tune."
            action={`${experiments.length} candidates`}
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Experiment</th>
                  <th>Status</th>
                  <th>Model</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((experiment) => (
                  <tr key={experiment.id}>
                    <td>
                      <strong>{experiment.name}</strong>
                      <div className="muted">{experiment.goal}</div>
                    </td>
                    <td>{experiment.status}</td>
                    <td>{experiment.candidateModel}</td>
                    <td>{formatCurrency(experiment.cost)}</td>
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

        <div className="page-grid two-column">
          <SectionCard
            title="Fine-tune queue"
            description="Spend GPU hours only after the data and experiments justify it."
            action={`${jobs.length} jobs`}
          >
            <div className="list">
              {jobs.map((job) => (
                <article key={job.id} className="list-item">
                  <div className="list-copy">
                    <h3>{job.name}</h3>
                    <p className="muted">
                      {job.baseModel} on {job.provider} - {job.gpuType}
                    </p>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="value-stack">
                    <strong>{job.progress}%</strong>
                    <span className="muted">{formatHours(job.gpuHours)}</span>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Release gates"
            description="No release should go live until quality, latency, and cost all look good."
            action={`${releases.length} tracked`}
          >
            <div className="list">
              {releases.map((release) => (
                <article key={release.id} className="list-item">
                  <div className="list-copy">
                    <h3>{release.name}</h3>
                    <p className="muted">
                      {release.channel} channel - {release.approvedBy}
                    </p>
                    <div className="status-row">
                      <span className="pill">Quality: {release.qualityGate}</span>
                      <span className="pill">Latency: {release.latencyGate}</span>
                      <span className="pill">Cost: {release.costGate}</span>
                    </div>
                  </div>
                  <div className="value-stack">
                    <strong>{release.status}</strong>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="Eval pulse"
          description="Quality must be visible before promotion, not after an outage."
          action={`${evals.length} benchmark suites`}
        >
          <div className="list">
            {evals.map((evalRun) => (
              <article key={evalRun.id} className="list-item">
                <div className="list-copy">
                  <h3>{evalRun.name}</h3>
                  <p className="muted">
                    {evalRun.benchmark} - judged by {evalRun.judge}
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

        <SectionCard
          title="Roadmap focus"
          description="What turns this strong foundation into a paid beta customers can trust."
          action={`${milestones.length} milestones`}
        >
          <ol className="checklist">
            {milestones.map((milestone) => (
              <li key={milestone}>{milestone}</li>
            ))}
          </ol>
        </SectionCard>
      </div>

      <aside className="timeline-sidebar">
        <section className="panel timeline-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Smart nudges</p>
              <h2>What needs attention next.</h2>
            </div>
            <span className="pill">{nudges.length} prompts</span>
          </div>
          <div className="list">
            {nudges.map((nudge) => (
              <article key={nudge.id} className="list-item">
                <div className="list-copy">
                  <span
                    className={
                      nudge.severity === "critical"
                        ? "pill danger"
                        : nudge.severity === "warning"
                          ? "pill warning"
                          : "pill success"
                    }
                  >
                    {nudge.severity}
                  </span>
                  <p className="muted">{nudge.message}</p>
                </div>
                <Link href={nudge.href} className="secondary-button">
                  {nudge.actionLabel}
                </Link>
              </article>
            ))}
          </div>
        </section>
        <ActivityTimeline items={activity} />
      </aside>
    </div>
  );
}
