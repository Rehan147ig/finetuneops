import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { createExperimentFromDatasetAction } from "@/app/experiments/actions";
import { ActionForm, ActionSubmitButton } from "@/components/feedback/action-form";
import { requireAuthSession } from "@/lib/auth-session";
import { formatNumber, formatPercent } from "@/lib/format";
import { getWorkspaceData } from "@/lib/workspace-data";

export default async function DatasetsPage() {
  const session = await requireAuthSession();
  const { datasets, traces } = await getWorkspaceData({
    organizationId: session.user.organizationId,
  });

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Datasets</p>
          <h2>Turn production failures into versioned training assets</h2>
        </div>
        <span className="pill">Next build: upload API plus signed URLs</span>
      </div>

      <SectionCard
        title="Dataset inventory"
        description="Every version should be inspectable before it feeds a run."
        action={`${datasets.length} datasets`}
      >
        <div className="list">
          {datasets.map((dataset) => (
            <article key={dataset.id} className="list-item">
              <div className="list-copy">
                <h3>{dataset.name}</h3>
                <p className="muted">
                  {dataset.source} - updated {dataset.lastUpdated}
                </p>
                <div className="list-meta">
                  <span className="pill">{dataset.version}</span>
                  <span
                    className={
                      dataset.status === "Ready"
                        ? "pill success"
                        : dataset.status === "Needs review"
                          ? "pill warning"
                          : "pill"
                    }
                  >
                    {dataset.status}
                  </span>
                </div>
              </div>
              <div className="mini-grid">
                <div className="value-stack">
                  <strong>{formatNumber(dataset.rows)} rows</strong>
                  <span className="muted">
                    {formatPercent(dataset.quality)} quality
                  </span>
                  <span className="muted">
                    {dataset.experimentCount ?? 0} experiments
                  </span>
                </div>
                <div className="auth-actions">
                  {dataset.status === "Ready" ? (
                    <ActionForm action={createExperimentFromDatasetAction}>
                      <input name="datasetId" type="hidden" value={dataset.id} />
                      <ActionSubmitButton
                        idleLabel="Start experiment"
                        pendingLabel="Starting experiment..."
                      />
                    </ActionForm>
                  ) : (
                    <span className="pill warning">Dataset not ready yet</span>
                  )}
                  <Link href={`/datasets/${dataset.id}`} className="secondary-button">
                    Open report
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="page-grid two-column">
        <SectionCard
          title="Promotion queue"
          description="The fastest dataset is the one created directly from a meaningful production failure."
          action={`${traces.filter((trace) => trace.canPromote).length} ready`}
        >
          <div className="list">
            {traces.slice(0, 3).map((trace) => (
              <article key={trace.id} className="list-item">
                <div className="list-copy">
                  <h3>{trace.title}</h3>
                  <p className="muted">
                    {trace.source} - opportunity {formatPercent(trace.opportunity)}
                  </p>
                </div>
                <div className="value-stack">
                  <strong>{trace.canPromote ? "Ready" : "Review"}</strong>
                  <span className="muted">{trace.status}</span>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Pipeline design"
          description="The backend needs a clean path from trace capture to train-ready slices."
          action="V1 architecture"
        >
          <ol className="checklist">
            <li>Ingest traces, tickets, and transcripts with project scoping.</li>
            <li>Create immutable dataset versions and metadata snapshots.</li>
            <li>Run deduplication, schema validation, and quality scoring.</li>
            <li>Approve train, validation, and eval splits before launch.</li>
          </ol>
        </SectionCard>

        <SectionCard
          title="What customers pay for"
          description="Not just storage, but confidence in their training data."
          action="Monetizable"
        >
          <div className="mini-grid">
            <article className="panel mini-card">
              <p className="eyebrow">Saved time</p>
              <h3>Stop hand-managing JSONL versions in random buckets.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Saved spend</p>
              <h3>Catch data issues before a long run burns GPU hours.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Saved trust</p>
              <h3>Give teams an audit trail for what trained each model.</h3>
            </article>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

