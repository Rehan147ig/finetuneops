export type DocSection = {
  heading: string;
  body: string[];
};

export type DocPage = {
  slug: string[];
  title: string;
  description: string;
  category: "Getting Started" | "Tracing" | "Datasets" | "Prompts" | "Releases" | "SDK";
  order: number;
  sections: DocSection[];
};

export const docsPages: DocPage[] = [
  {
    slug: ["getting-started"],
    title: "Getting Started",
    description: "Set up FineTuneOps for a team that ships prompts, datasets, and fine-tunes in production.",
    category: "Getting Started",
    order: 1,
    sections: [
      {
        heading: "Why teams adopt FineTuneOps",
        body: [
          "FineTuneOps is built around the operational loop that high-performing LLM teams repeat every week: trace failures, promote the best examples into datasets, compare fixes, fine-tune only when needed, and gate releases on quality, latency, and cost.",
          "The product becomes valuable when it acts as shared memory. Teams stop guessing which prompt, dataset, or model is currently live because every production decision stays visible in one place.",
        ],
      },
      {
        heading: "First workspace checklist",
        body: [
          "Create a workspace, invite teammates, and connect provider credentials in Settings so workers can talk to OpenAI, Anthropic, or Hugging Face securely.",
          "Capture a few real failure traces before building datasets. Strong teams start from production evidence instead of synthetic examples.",
        ],
      },
    ],
  },
  {
    slug: ["traces", "capture-and-promote"],
    title: "Capture and Promote Traces",
    description: "Turn production failures into the training data that actually matters.",
    category: "Tracing",
    order: 2,
    sections: [
      {
        heading: "Capture traces quickly",
        body: [
          "Use the Trace intake UI or the SDK to capture failures while they are still actionable. The trace backlog is where support tickets, QA findings, and red-team examples become product work.",
          "Each trace records the title, source, model, latency, tags, and any useful metadata so the team can decide if it deserves curation time.",
        ],
      },
      {
        heading: "Promote only the best failures",
        body: [
          "FineTuneOps scores traces by severity and opportunity. Promote the cases that are frequent, expensive, or high-risk rather than labeling every possible edge case.",
          "When a trace becomes a dataset example, the system preserves the lineage so future quality work can be traced back to the original failure.",
        ],
      },
    ],
  },
  {
    slug: ["datasets", "quality-engine"],
    title: "Dataset Quality Engine",
    description: "Inspect duplicates, PII, length issues, and cost waste before launching training jobs.",
    category: "Datasets",
    order: 3,
    sections: [
      {
        heading: "What gets scored",
        body: [
          "Every dataset can be scored for exact duplicates, near duplicates, PII, short or long samples, empty outputs, and imbalance signals.",
          "The health score is designed to answer a practical question: should the team spend GPU hours on this version right now or clean it first?",
        ],
      },
      {
        heading: "Clean with version safety",
        body: [
          "Cleanup actions create new dataset versions rather than mutating the original in place. That keeps experiments auditable and makes it easier to explain why quality changed after a cleanup pass.",
        ],
      },
    ],
  },
  {
    slug: ["prompts", "versioning"],
    title: "Prompt Versioning",
    description: "Track exactly which prompt is live, compare revisions, and preview variables before deployment.",
    category: "Prompts",
    order: 4,
    sections: [
      {
        heading: "Treat prompts like production assets",
        body: [
          "Every prompt template can have multiple versions, explicit deployment targets, and visible commit messages. This removes the common failure mode where nobody knows which prompt was changed before quality regressed.",
          "Diff view shows the current version against any selected version, while the playground lets reviewers preview variable substitution without calling an LLM.",
        ],
      },
      {
        heading: "Use prompt history during incidents",
        body: [
          "When latency, tone, or correctness shifts, prompt history is often the fastest way to explain the change. Compare versions before blaming the model or the dataset.",
        ],
      },
    ],
  },
  {
    slug: ["releases", "gates-and-approvals"],
    title: "Release Gates and Approvals",
    description: "Ship only when evals, latency, and cost all clear your gates.",
    category: "Releases",
    order: 5,
    sections: [
      {
        heading: "Make release decisions visible",
        body: [
          "FineTuneOps keeps release records attached to experiments and training jobs so every launch has context. Review links let teammates approve or reject a release without logging into the full workspace.",
          "A good release process makes quality, latency, and cost visible in one place so product, engineering, and ML owners can agree on the trade-off.",
        ],
      },
    ],
  },
  {
    slug: ["sdk", "overview"],
    title: "SDK Overview",
    description: "Instrument traces automatically and fetch prompt templates directly from your application.",
    category: "SDK",
    order: 6,
    sections: [
      {
        heading: "Use the SDK for fast adoption",
        body: [
          "The FinetuneOps SDK can wrap OpenAI and Anthropic clients, batch trace capture, and fetch current prompt templates by name.",
          "SDK prompt lookups are cached locally for five minutes so applications can reuse the live template without hammering the API on every request.",
        ],
      },
    ],
  },
];

export function getDocsNavigation() {
  const grouped = new Map<DocPage["category"], DocPage[]>();

  for (const page of [...docsPages].sort((left, right) => left.order - right.order)) {
    const current = grouped.get(page.category) ?? [];
    current.push(page);
    grouped.set(page.category, current);
  }

  return [...grouped.entries()].map(([category, pages]) => ({
    category,
    pages,
  }));
}

export function getDocBySlug(slug: string[]) {
  return docsPages.find((page) => page.slug.join("/") === slug.join("/")) ?? null;
}

export function getDocsSearchDocuments() {
  return docsPages.map((page) => ({
    sourceType: "doc_page",
    sourceId: page.slug.join("/"),
    title: page.title,
    slug: `/docs/${page.slug.join("/")}`,
    content: [
      page.title,
      page.description,
      ...page.sections.flatMap((section) => [section.heading, ...section.body]),
    ].join("\n\n"),
    metadata: {
      category: page.category,
      description: page.description,
    },
  }));
}
