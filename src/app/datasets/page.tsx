import { SectionCard } from "@/components/dashboard/section-card";
import { formatNumber, formatPercent } from "@/lib/format";
import { datasets } from "@/lib/mock-data";

export default function DatasetsPage() {
  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Datasets</p>
          <h2>Version, score, and prepare training data</h2>
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
                  {dataset.source} • updated {dataset.lastUpdated}
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

      <div className="page-grid two-column">
        <SectionCard
          title="Pipeline design"
          description="The backend needs a clean ingestion path from raw data to train-ready slices."
          action="V1 architecture"
        >
          <ol className="checklist">
            <li>Upload raw files to object storage with project scoping.</li>
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
