import { SearchPanel } from "@/components/search/search-panel";
import { requireAuthSession } from "@/lib/auth-session";

export default async function WorkspaceSearchPage() {
  await requireAuthSession();

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Vector search</p>
          <h2>Search traces, datasets, prompts, and docs from one place</h2>
          <p className="muted">
            Use semantic search to find the failure, cleanup note, prompt revision, or
            public guide that matches what you are trying to fix.
          </p>
        </div>
      </div>

      <SearchPanel
        scope="workspace"
        placeholder="Search refund regressions, prompt tone changes, dataset cleanup..."
        emptyCopy="Start typing to search your workspace and the public docs together."
        title="Search your workspace"
      />
    </div>
  );
}
