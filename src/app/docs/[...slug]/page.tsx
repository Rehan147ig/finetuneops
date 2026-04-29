import { notFound } from "next/navigation";
import { SearchPanel } from "@/components/search/search-panel";
import { getDocBySlug } from "@/lib/docs-content";

type DocDetailPageProps = {
  params: Promise<{
    slug: string[];
  }>;
};

export default async function DocDetailPage({ params }: DocDetailPageProps) {
  const { slug } = await params;
  const page = getDocBySlug(slug);

  if (!page) {
    notFound();
  }

  return (
    <div className="page-grid">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{page.category}</p>
          <h2>{page.title}</h2>
          <p className="muted">{page.description}</p>
        </div>
      </div>

      <SearchPanel
        scope="docs"
        placeholder="Search docs..."
        emptyCopy="Search the documentation from any page."
      />

      {page.sections.map((section) => (
        <section className="panel page-grid" key={section.heading}>
          <div className="mini-grid">
            <p className="eyebrow">{section.heading}</p>
            {section.body.map((paragraph) => (
              <p className="muted" key={paragraph}>
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
