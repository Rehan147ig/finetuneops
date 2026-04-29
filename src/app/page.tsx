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
        <div className="hero-copy">
          <div>
            <p className="eyebrow">{workspaceName}</p>
            <h2>{activeProject}</h2>
          </div>
          <p className="muted">
            FineTuneOps is now shaped around the market-winning loop: trace
            failures from production, convert the best ones into datasets,
            compare candidate fixes, fine-tune only when needed, and gate every
            release on quality, latency, and cost.
          </p>
          <div className="hero-actions">
            <span className="pill success">V1 focus: post-training teams</span>
            <span className="pill">Trace - Curate - Evaluate - Fine-tune - Promote</span>
            <span className="pill">{summary.memberCount} members</span>
            <span className="pill">{summary.billingPlan} plan</span>
          </div>
        </div>
        <div className="hero-side">
          <article className="panel mini-card">
            <p className="eyebrow">Current promise</p>
            <h3>Turn real LLM failures into safer, cheaper, better releases.</h3>
          </article>
          <article className="panel mini-card">
            <p className="eyebrow">Revenue path</p>
            <h3>Charge teams for reliability, visibility, and fewer wasted experiments.</h3>
          </article>
        </div>
      </section>

      <section className="metric-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <SectionCard
        title="Workflow"
        description="This is the operational loop customers will come back to every week."
        action="5 stages"
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
                  <p className="muted">{trace.source} • captured {trace.capturedAt}</p>
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
              decisions, regressions, and releases rather than another page they
              only open during emergencies.
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
                    {job.baseModel} on {job.provider} • {job.gpuType}
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
                  <p className="muted">{release.channel} channel • {release.approvedBy}</p>
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
