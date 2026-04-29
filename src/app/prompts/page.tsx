import Link from "next/link";
import { requireAuthSession } from "@/lib/auth-session";
import { getPromptTemplates } from "@/lib/prompt-data";

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PromptsPage() {
  const session = await requireAuthSession();
  const templates = await getPromptTemplates(session.user.organizationId);

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Prompts</p>
          <h2>Track prompt versions before quality drifts in production</h2>
        </div>
        <Link className="primary-button" href="/prompts/new">
          Create prompt
        </Link>
      </div>

      {templates.length === 0 ? (
        <section className="panel page-grid">
          <div className="mini-grid">
            <p className="eyebrow">No prompts yet</p>
            <h3>Create your first prompt template to start tracking versions.</h3>
            <p className="muted">
              Keep prompt history, deployments, and variable usage visible to the whole
              team.
            </p>
          </div>
          <div>
            <Link className="primary-button" href="/prompts/new">
              Create prompt
            </Link>
          </div>
        </section>
      ) : (
        <div className="card-grid">
          {templates.map((template) => (
            <Link
              className="panel prompt-card"
              href={`/prompts/${template.id}`}
              key={template.id}
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{template.name}</p>
                  <h3>{template.currentVersion?.version ?? "No version yet"}</h3>
                </div>
                {template.currentEnvironment ? (
                  <span className="pill success">{template.currentEnvironment}</span>
                ) : (
                  <span className="pill">Not deployed</span>
                )}
              </div>
              <div className="mini-grid">
                <p className="muted">
                  {template.variableCount}{" "}
                  {template.variableCount === 1 ? "variable" : "variables"}
                </p>
                <p className="muted">
                  {template.versionCount}{" "}
                  {template.versionCount === 1 ? "version" : "versions"}
                </p>
                <p className="muted">Updated {formatDate(template.updatedAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
