import { SectionCard } from "@/components/dashboard/section-card";
import { formatHours } from "@/lib/format";
import { jobs } from "@/lib/mock-data";

function statusClass(status: string): string {
  switch (status) {
    case "Running":
      return "pill success";
    case "Failed":
      return "pill danger";
    case "Queued":
      return "pill warning";
    default:
      return "pill";
  }
}

export default function JobsPage() {
  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Training jobs</p>
          <h2>Launch, recover, and monitor long-running jobs</h2>
        </div>
        <span className="pill success">Focus: checkpointing plus retries</span>
      </div>

      <SectionCard
        title="Job board"
        description="This is the center of the value prop for stressed ML teams."
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
                <div className="list-meta">
                  <span className={statusClass(job.status)}>{job.status}</span>
                  <span className="pill">{job.checkpoint}</span>
                </div>
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

      <div className="page-grid two-column">
        <SectionCard
          title="Execution architecture"
          description="How the real backend should run jobs after this UI shell."
          action="Next implementation"
        >
          <ol className="checklist">
            <li>Persist a job request and resolve dataset plus model config.</li>
            <li>Queue work to a dedicated training worker with provider adapters.</li>
            <li>Stream logs, metrics, and checkpoint metadata back to the app.</li>
            <li>Auto-resume on interruption when checkpoints exist.</li>
          </ol>
        </SectionCard>

        <SectionCard
          title="Failure handling"
          description="These are the product details that make people keep paying."
          action="High priority"
        >
          <div className="mini-grid">
            <article className="panel mini-card">
              <p className="eyebrow">Bad node detection</p>
              <h3>Fingerprint repeated hardware failures and blacklist them.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Checkpoint restore</p>
              <h3>Recover from mid-run crashes instead of starting from zero.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Spend visibility</p>
              <h3>Show GPU burn in real time before jobs quietly spiral.</h3>
            </article>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
