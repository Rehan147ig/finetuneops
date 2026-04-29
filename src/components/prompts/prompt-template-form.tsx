"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { extractVariables } from "@/lib/prompt-utils";

export function PromptTemplateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [commitMessage, setCommitMessage] = useState("Initial version");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const variables = useMemo(() => extractVariables(content), [content]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          content,
          commitMessage,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; id?: string }
        | null;

      if (!response.ok || !body?.id) {
        setError(body?.error ?? "Prompt template could not be created.");
        return;
      }

      router.push(`/prompts/${body.id}`);
      router.refresh();
    } catch {
      setError("Prompt template could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="page-grid" onSubmit={handleSubmit}>
      <div className="page-grid two-column">
        <label className="mini-grid">
          <span className="eyebrow">Name</span>
          <input
            name="name"
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="customer-support"
          />
        </label>
        <label className="mini-grid">
          <span className="eyebrow">Commit message</span>
          <input
            name="commitMessage"
            type="text"
            required
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.target.value)}
            placeholder="Initial version"
          />
        </label>
      </div>

      <label className="mini-grid">
        <span className="eyebrow">Description</span>
        <textarea
          name="description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Internal support prompt for refund escalation triage"
        />
      </label>

      <label className="mini-grid">
        <span className="eyebrow">Initial prompt content</span>
        <textarea
          name="content"
          rows={14}
          required
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={"You are a support assistant for {{customer_name}}.\nResolve the issue: {{issue}}"}
        />
      </label>

      <div className="panel mini-card">
        <p className="eyebrow">Variables detected</p>
        {variables.length === 0 ? (
          <p className="muted">No variables detected yet.</p>
        ) : (
          <div className="token-row">
            {variables.map((variable) => (
              <span className="pill" key={variable}>
                {`{{${variable}}}`}
              </span>
            ))}
          </div>
        )}
      </div>

      {error ? <p className="pill warning">{error}</p> : null}

      <div>
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Creating prompt..." : "Create prompt"}
        </button>
      </div>
    </form>
  );
}
