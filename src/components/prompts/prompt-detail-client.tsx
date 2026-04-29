"use client";

import type { FormEvent } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PromptDiff } from "@/components/prompts/prompt-diff";
import { renderPromptTemplate } from "@/lib/prompt-utils";

type SerializablePromptVersion = {
  id: string;
  version: string;
  content: string;
  variables: string[];
  commitMessage: string;
  authorId: string;
  createdAt: string;
  evalScore: number | null;
  latencyMs: number | null;
  deployedAt: string | null;
  deployedBy: string | null;
  environment: string | null;
};

type PromptDetailClientProps = {
  template: {
    id: string;
    name: string;
    description: string | null;
    currentVersionId: string | null;
    currentVersion: SerializablePromptVersion | null;
    versions: SerializablePromptVersion[];
  };
};

function formatPromptDate(value: string | null) {
  if (!value) {
    return "Not deployed yet";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PromptDetailClient({ template }: PromptDetailClientProps) {
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [newContent, setNewContent] = useState("");
  const [newCommitMessage, setNewCommitMessage] = useState("");
  const [playgroundValues, setPlaygroundValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const currentVersion = template.currentVersion;
  const comparedVersion =
    template.versions.find((version) => version.id === compareVersionId) ?? null;
  const playgroundVariables = currentVersion?.variables ?? [];
  const renderedPreview = useMemo(() => {
    if (!currentVersion) {
      return "";
    }

    return renderPromptTemplate(currentVersion.content, playgroundValues);
  }, [currentVersion, playgroundValues]);

  async function deployVersion(versionId: string) {
    setError("");

    try {
      const response = await fetch(
        `/api/prompts/${template.id}/versions/${versionId}/deploy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            environment: "production",
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(body?.error ?? "Prompt deployment failed.");
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Prompt deployment failed.");
    }
  }

  async function createVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const response = await fetch(`/api/prompts/${template.id}/versions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: newContent,
          commitMessage: newCommitMessage,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(body?.error ?? "Prompt version could not be created.");
        return;
      }

      setShowComposer(false);
      setNewContent("");
      setNewCommitMessage("");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Prompt version could not be created.");
    }
  }

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Prompt template</p>
          <h2>{template.name}</h2>
          <p className="muted">
            {template.description ?? "Track prompt changes, compare versions, and keep production deployments explicit."}
          </p>
        </div>
        <div className="auth-actions">
          <span className="pill">
            Current {currentVersion?.version ?? "No version"}
          </span>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setShowComposer((value) => !value)}
          >
            {showComposer ? "Cancel" : "New version"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setShowHistory((value) => !value)}
          >
            {showHistory ? "Hide history" : "View history"}
          </button>
        </div>
      </div>

      {error ? <p className="pill warning">{error}</p> : null}

      <section className="panel page-grid">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current version content</p>
            <h3>{currentVersion?.version ?? "No current version"}</h3>
          </div>
          <div className="auth-actions">
            {currentVersion?.environment ? (
              <span className="pill success">{currentVersion.environment}</span>
            ) : null}
            <span className="pill">
              Deployed {formatPromptDate(currentVersion?.deployedAt ?? null)}
            </span>
          </div>
        </div>
        <pre className="prompt-block">
          <code>{currentVersion?.content ?? "No prompt content available yet."}</code>
        </pre>
        <div className="mini-grid">
          <p className="eyebrow">Variables detected</p>
          <div className="token-row">
            {(currentVersion?.variables ?? []).map((variable) => (
              <span className="pill" key={variable}>
                {`{{${variable}}}`}
              </span>
            ))}
            {(currentVersion?.variables ?? []).length === 0 ? (
              <span className="muted">No variables detected.</span>
            ) : null}
          </div>
          <p className="muted">
            Deployed by {currentVersion?.deployedBy ?? "No deployment yet"} on{" "}
            {formatPromptDate(currentVersion?.deployedAt ?? null)}.
          </p>
        </div>
      </section>

      {showComposer ? (
        <section className="panel page-grid">
          <div className="section-heading">
            <div>
              <p className="eyebrow">New version</p>
              <h3>Create the next revision</h3>
            </div>
          </div>
          <form className="page-grid" onSubmit={createVersion}>
            <label className="mini-grid">
              <span className="eyebrow">Commit message</span>
              <input
                name="commitMessage"
                type="text"
                required
                value={newCommitMessage}
                onChange={(event) => setNewCommitMessage(event.target.value)}
                placeholder="Tighten escalation rubric"
              />
            </label>
            <label className="mini-grid">
              <span className="eyebrow">Prompt content</span>
              <textarea
                name="content"
                rows={12}
                required
                value={newContent}
                onChange={(event) => setNewContent(event.target.value)}
                placeholder={currentVersion?.content ?? "Write your next prompt version"}
              />
            </label>
            <div>
              <button className="primary-button" disabled={isPending} type="submit">
                Save version
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {showHistory ? (
        <section className="panel page-grid">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Version timeline</p>
              <h3>Every revision, newest first</h3>
            </div>
          </div>
          <div className="page-grid">
            {template.versions.map((version) => {
              const isCurrent = version.id === template.currentVersionId;

              return (
                <article className="panel mini-card prompt-version-card" key={version.id}>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">{version.version}</p>
                      <h3>{version.commitMessage}</h3>
                    </div>
                    <div className="auth-actions">
                      {isCurrent ? <span className="pill success">Current</span> : null}
                      {version.environment ? <span className="pill">{version.environment}</span> : null}
                    </div>
                  </div>
                  <div className="mini-grid">
                    <p className="muted">Author: {version.authorId}</p>
                    <p className="muted">
                      Date: {new Date(version.createdAt).toLocaleString("en-US")}
                    </p>
                    <p className="muted">
                      Eval score: {version.evalScore == null ? "Not available" : version.evalScore}
                    </p>
                  </div>
                  <div className="auth-actions">
                    {!isCurrent ? (
                      <button
                        className="primary-button"
                        disabled={isPending}
                        type="button"
                        onClick={() => void deployVersion(version.id)}
                      >
                        Deploy to production
                      </button>
                    ) : null}
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        setCompareVersionId((current) =>
                          current === version.id ? null : version.id,
                        )
                      }
                    >
                      {compareVersionId === version.id ? "Hide compare" : "Compare"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {currentVersion && comparedVersion ? (
        <section className="panel page-grid">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Diff view</p>
              <h3>
                Compare {currentVersion.version} with {comparedVersion.version}
              </h3>
            </div>
          </div>
          <PromptDiff
            versionAContent={currentVersion.content}
            versionBContent={comparedVersion.content}
            versionALabel={currentVersion.version}
            versionBLabel={comparedVersion.version}
          />
        </section>
      ) : null}

      {currentVersion ? (
        <section className="panel page-grid">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Playground</p>
              <h3>Preview variable replacement</h3>
            </div>
          </div>
          {playgroundVariables.length === 0 ? (
            <p className="muted">This prompt has no variables to fill.</p>
          ) : (
            <>
              <div className="page-grid two-column">
                {playgroundVariables.map((variable) => (
                  <label className="mini-grid" key={variable}>
                    <span className="eyebrow">{`{{${variable}}}`}</span>
                    <input
                      type="text"
                      value={playgroundValues[variable] ?? ""}
                      onChange={(event) =>
                        setPlaygroundValues((current) => ({
                          ...current,
                          [variable]: event.target.value,
                        }))
                      }
                      placeholder={`Value for ${variable}`}
                    />
                  </label>
                ))}
              </div>
              <div className="auth-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setPreview(renderedPreview)}
                >
                  Preview
                </button>
              </div>
              <pre className="prompt-block">
                <code>{preview || "Fill variables and click Preview to render this prompt."}</code>
              </pre>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
