import { SectionCard } from "@/components/dashboard/section-card";

const integrations = [
  "Authentication provider for teams and organization roles",
  "Managed Postgres for production metadata",
  "S3 or R2 buckets for dataset and artifact storage",
  "Stripe billing for subscription and usage metering",
  "GPU providers such as RunPod, Vast, or Lambda",
];

export default function SettingsPage() {
  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Prepare the shell for real tenants, billing, and providers</h2>
        </div>
        <span className="pill warning">Still local-first</span>
      </div>

      <div className="page-grid two-column">
        <SectionCard
          title="Production checklist"
          description="These are the integrations that turn the app into a business."
          action="Core SaaS"
        >
          <ol className="checklist">
            {integrations.map((integration) => (
              <li key={integration}>{integration}</li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard
          title="Current schema"
          description="The Prisma models already define the first product entities."
          action="Organizations, projects, datasets, jobs, evals"
        >
          <div className="mini-grid">
            <article className="panel mini-card">
              <p className="eyebrow">Organizations</p>
              <h3>Multi-tenant boundary for billing and permissions.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Projects</p>
              <h3>Each model initiative gets isolated datasets and runs.</h3>
            </article>
            <article className="panel mini-card">
              <p className="eyebrow">Execution data</p>
              <h3>Jobs and evals become the operational heartbeat of the app.</h3>
            </article>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
