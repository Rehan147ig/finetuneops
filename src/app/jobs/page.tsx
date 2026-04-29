import { processBackgroundJobAction, retryBackgroundJobAction } from "@/app/jobs/actions";
import { SectionCard } from "@/components/dashboard/section-card";
import { ActionForm, ActionSubmitButton } from "@/components/feedback/action-form";
import { requireAuthSession } from "@/lib/auth-session";
import { formatHours } from "@/lib/format";
import { getQueueStats, type QueueStats } from "@/lib/queue-monitor";
import { getWorkspaceData } from "@/lib/workspace-data";

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

function queueStatusLabel(level: QueueStats["level"]) {
  switch (level) {
    case "warning":
      return {
        className: "pill warning",
        label: "High load",
      };
    case "critical":
      return {
        className: "pill danger",
        label: "Critical",
      };
    default:
      return {
        className: "pill success",
        label: "Healthy",
      };
  }
}

export default async function JobsPage() {
  const session = await requireAuthSession();
  const { jobs, backgroundJobs } = await getWorkspaceData({
    organizationId: session.user.organizationId,
  });
  let queueStats: QueueStats[] | null = null;

  try {
    queueStats = await getQueueStats();
  } catch {
    queueStats = null;
  }

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fine-tunes</p>
          <h2>Launch targeted runs only after the evidence is ready</h2>
        </div>
        <span className="pill success">Focus: checkpointing plus retries</span>
      </div>

      <SectionCard
        title="Queue health"
        description="Queue depth is the fastest signal that the worker fleet is starting to fall behind."
        action={queueStats ? `${queueStats.length} queues checked` : "Unavailable"}
      >
        {queueStats ? (
          <div className="list">
            {queueStats.map((queue) => {
              const status = queueStatusLabel(queue.level);

              return (
                <article key={queue.name} className="list-item">
                  <div className="list-copy">
                    <h3>{queue.name}</h3>
                    <p className="muted">Refreshes on page load</p>
                  </div>
                  <div className="list-meta">
                    <span className="pill">Waiting: {queue.waiting}</span>
                    <span className="pill">Active: {queue.active}</span>
                    <span className={status.className}>{status.label}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <article className="list-item">
            <div className="list-copy">
              <h3>Queue stats unavailable</h3>
              <p className="muted">
                The jobs page is still available, but queue monitoring could not be loaded for
                this request.
              </p>
            </div>
          </article>
        )}
      </SectionCard>

      <SectionCard
        title="Job board"
        description="Fine-tuning is still important, but it sits downstream of traces and experiments now."
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
                <div className="list-meta">
                  <span className={statusClass(job.status)}>{job.status}</span>
                  <span className="pill">{job.checkpoint}</span>
                  {job.experimentName ? <span className="pill">{job.experimentName}</span> : null}
                  {job.datasetName ? <span className="pill">{job.datasetName}</span> : null}
                  {job.progressNote ? <span className="pill">{job.progressNote}</span> : null}
                  {job.openaiJobId ? <span className="pill">OpenAI: {job.openaiJobId}</span> : null}
                  {typeof job.pollCount === "number" ? (
                    <span className="pill">Polls: {job.pollCount}</span>
                  ) : null}
                  {job.completedModelId ? (
                    <span className="pill">Model: {job.completedModelId}</span>
                  ) : null}
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${job.progress}%` }} />
                </div>
              </div>
              <div className="value-stack">
                <strong>{job.progress}%</strong>
                <span className="muted">{formatHours(job.gpuHours)}</span>
                {job.openaiJobId ? <span className="muted">{job.openaiJobId}</span> : null}
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Async work queue"
        description="Long-running ops tasks now have a dedicated queue contract so the product can stay responsive under load."
        action={`${backgroundJobs.length} background jobs`}
      >
        <div className="list">
          {backgroundJobs.length === 0 ? (
            <article className="list-item">
              <div className="list-copy">
                <h3>No background jobs yet</h3>
                <p className="muted">
                  Queue-driven ingestion, scoring, safety scans, and notifications will show up
                  here.
                </p>
              </div>
            </article>
          ) : (
            backgroundJobs.map((job) => (
              <article key={job.id} className="list-item">
                <div className="list-copy">
                  <h3>{job.jobType}</h3>
                  <p className="muted">
                    {job.queueName} - {job.createdAt}
                  </p>
                  <div className="list-meta">
                    <span className={statusClass(job.status)}>{job.status}</span>
                    <span className="pill">
                      Attempts: {job.attempts}/{job.maxAttempts}
                    </span>
                    {job.estimatedCompletion ? (
                      <span className="pill">ETA: {job.estimatedCompletion}</span>
                    ) : null}
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${job.progress}%` }} />
                  </div>
                  {job.logs.length > 0 ? (
                    <ul className="checklist">
                      {job.logs.slice(0, 3).map((entry) => (
                        <li key={`${job.id}-${entry}`}>{entry}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="value-stack">
                  <strong>{job.progress}%</strong>
                  {job.status === "Queued" || job.status === "Running" ? (
                    <ActionForm action={processBackgroundJobAction}>
                      <input name="backgroundJobId" type="hidden" value={job.id} />
                      <ActionSubmitButton
                        idleLabel={job.status === "Queued" ? "Process job" : "Finish run"}
                        pendingLabel="Processing..."
                        className="secondary-button"
                      />
                    </ActionForm>
                  ) : null}
                  {job.status === "Failed" ? (
                    <ActionForm action={retryBackgroundJobAction}>
                      <input name="backgroundJobId" type="hidden" value={job.id} />
                      <ActionSubmitButton
                        idleLabel="Retry job"
                        pendingLabel="Retrying..."
                        className="secondary-button"
                      />
                    </ActionForm>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </SectionCard>

      <div className="page-grid two-column">
        <SectionCard
          title="Execution architecture"
          description="How the backend should run fine-tunes after the product shell."
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
