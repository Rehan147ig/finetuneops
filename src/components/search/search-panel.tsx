"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SearchResult = {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  snippet: string;
  href: string;
  score: number;
  metadata: Record<string, unknown>;
};

type SearchPanelProps = {
  scope: "docs" | "workspace";
  placeholder: string;
  emptyCopy: string;
  title?: string;
};

export function SearchPanel({
  scope,
  placeholder,
  emptyCopy,
  title,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError("");
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&scope=${scope}`,
          {
            signal: controller.signal,
          },
        );

        const body = (await response.json().catch(() => null)) as
          | { error?: string; results?: SearchResult[] }
          | null;

        if (!response.ok) {
          setError(body?.error ?? "Search could not be completed.");
          setResults([]);
          return;
        }

        setResults(body?.results ?? []);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setError("Search could not be completed.");
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query, scope]);

  return (
    <div className="panel page-grid search-panel">
      {title ? (
        <div className="mini-grid">
          <p className="eyebrow">Search</p>
          <h3>{title}</h3>
        </div>
      ) : null}
      <label className="mini-grid">
        <span className="eyebrow">Query</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
        />
      </label>

      {loading ? <p className="muted">Searching…</p> : null}
      {error ? <p className="pill warning">{error}</p> : null}

      {!query.trim() ? (
        <p className="muted">{emptyCopy}</p>
      ) : results.length === 0 && !loading && !error ? (
        <p className="muted">No results found for this query yet.</p>
      ) : (
        <div className="list">
          {results.map((result) => (
            <article className="list-item" key={result.id}>
              <div className="list-copy">
                <h3>{result.title}</h3>
                <p className="muted">{result.snippet}</p>
                <div className="list-meta">
                  <span className="pill">{result.sourceType.replace(/_/g, " ")}</span>
                  <span className="pill">{Math.round(result.score * 100)} match</span>
                </div>
              </div>
              <Link className="secondary-button" href={result.href}>
                Open
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
