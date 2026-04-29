"use client";

import { useState, useTransition } from "react";
import { ActionForm, ActionSubmitButton } from "@/components/feedback/action-form";
import { formatPercent } from "@/lib/format";
import type { ActionResult } from "@/lib/action-state";
import type { TraceRecord } from "@/lib/types";

type TraceBacklogProps = {
  initialTraces: TraceRecord[];
  initialNextCursor: string | null;
  promoteAction: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  pageSize?: number;
};

type TracePageResponse = {
  traces?: TraceRecord[];
  nextCursor?: string | null;
  error?: string;
};

export function TraceBacklog({
  initialTraces,
  initialNextCursor,
  promoteAction,
  pageSize = 20,
}: TraceBacklogProps) {
  const [traces, setTraces] = useState(initialTraces);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadNextPage() {
    if (!nextCursor) {
      return;
    }

    setError(null);

    const params = new URLSearchParams({
      cursor: nextCursor,
      limit: String(pageSize),
    });
    const response = await fetch(`/api/traces?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = (await response.json()) as TracePageResponse;

    if (!response.ok) {
      setError(body.error ?? "Unable to load more traces right now.");
      return;
    }

    setTraces((current) => [...current, ...(body.traces ?? [])]);
    setNextCursor(body.nextCursor ?? null);
  }

  return (
    <div className="mini-grid">
      <p className="muted">Showing {traces.length} traces with cursor-based loading.</p>
      <div className="list">
        {traces.map((trace) => (
          <article key={trace.id} className="list-item">
            <div className="list-copy">
              <h3>{trace.title}</h3>
              <p className="muted">
                {trace.source} | captured {trace.capturedAt}
              </p>
              <div className="list-meta">
                <span className="pill">{trace.severity}</span>
                <span
                  className={
                    trace.status === "Ready for curation"
                      ? "pill success"
                      : trace.status === "Needs labeling"
                        ? "pill warning"
                        : "pill"
                  }
                >
                  {trace.status}
                </span>
              </div>
            </div>
            <div className="mini-grid">
              <div className="value-stack">
                <strong>{trace.spanCount} spans</strong>
                <span className="muted">
                  {formatPercent(trace.opportunity)} opportunity
                </span>
              </div>
              {trace.canPromote ? (
                <ActionForm action={promoteAction}>
                  <input name="traceId" type="hidden" value={trace.id} />
                  <ActionSubmitButton
                    idleLabel="Promote to dataset"
                    pendingLabel="Promoting..."
                  />
                </ActionForm>
              ) : trace.convertedDatasetId ? (
                <span className="pill success">Dataset created</span>
              ) : (
                <span className="pill warning">Needs more work first</span>
              )}
            </div>
          </article>
        ))}
      </div>

      {error ? <p className="muted">{error}</p> : null}

      {nextCursor ? (
        <div>
          <button
            className="secondary-button"
            disabled={isPending}
            onClick={() => {
              startTransition(() => {
                void loadNextPage();
              });
            }}
            type="button"
          >
            {isPending ? "Loading more..." : "Load more traces"}
          </button>
        </div>
      ) : (
        <span className="pill">All available traces loaded</span>
      )}
    </div>
  );
}
