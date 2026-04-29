import Link from "next/link";
import { SearchPanel } from "@/components/search/search-panel";
import { docsPages } from "@/lib/docs-content";

export default function DocsHomePage() {
  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Documentation</p>
          <h2>Learn the workflows that make FineTuneOps sticky for real teams</h2>
          <p className="muted">
            These guides cover the operational loop behind the product: capture
            failures, build safer datasets, version prompts, run training jobs,
            and gate releases.
          </p>
        </div>
      </div>

      <SearchPanel
        scope="docs"
        placeholder="Search docs, SDK usage, prompt versioning, release gates..."
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
