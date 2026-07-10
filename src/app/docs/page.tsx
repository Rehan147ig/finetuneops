import Link from "next/link";
import { SearchPanel } from "@/components/search/search-panel";
import { docsPages } from "@/lib/docs-content";

export default function DocsHomePage() {
  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Documentation</p>
          <h2>Run FineTuneOps where LLM teams already ship</h2>
          <p className="muted">
            These guides cover the product wedge: compare baseline and candidate
            evals, explain regressions, gate releases in CI, and use TRA when
            fine-tune training data is involved.
          </p>
        </div>
      </div>

      <SearchPanel
        scope="docs"
        placeholder="Search docs, CLI usage, TRA reports, release gates..."
        emptyCopy="Start typing to search the documentation."
        title="Search the docs"
      />

      <div className="card-grid">
        {docsPages.map((page) => (
          <Link
            className="panel prompt-card"
            href={`/docs/${page.slug.join("/")}`}
            key={page.slug.join("/")}
          >
            <div className="mini-grid">
              <p className="eyebrow">{page.category}</p>
              <h3>{page.title}</h3>
              <p className="muted">{page.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
