import { PromptTemplateForm } from "@/components/prompts/prompt-template-form";
import { requireAuthSession } from "@/lib/auth-session";

export default async function NewPromptPage() {
  await requireAuthSession();

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">New prompt</p>
          <h2>Create a prompt template with version tracking from day one</h2>
        </div>
      </div>

      <section className="panel page-grid">
        <div className="mini-grid">
          <p className="eyebrow">First version</p>
          <h3>Capture the prompt your team wants to remember and compare later.</h3>
          <p className="muted">
            Variables are detected automatically so reviewers can preview filled prompts
            before deployment.
          </p>
        </div>
        <PromptTemplateForm />
      </section>
    </div>
  );
}
