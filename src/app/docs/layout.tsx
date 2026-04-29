import Link from "next/link";
import { getDocsNavigation } from "@/lib/docs-content";

export default function DocsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navigation = getDocsNavigation();

  return (
    <div className="docs-shell">
      <aside className="docs-sidebar">
        <div className="mini-grid">
          <Link className="brand-name" href="/docs">
            FineTuneOps Docs
          </Link>
          <p className="muted">
            Public guidance for tracing, datasets, prompts, SDK usage, and release ops.
          </p>
        </div>
        <nav className="docs-nav">
          {navigation.map((group) => (
            <div className="mini-grid" key={group.category}>
              <p className="eyebrow">{group.category}</p>
              <div className="mini-grid">
                {group.pages.map((page) => (
                  <Link
                    className="docs-nav-link"
                    href={`/docs/${page.slug.join("/")}`}
                    key={page.slug.join("/")}
                  >
                    {page.title}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="docs-content">{children}</main>
    </div>
  );
}
