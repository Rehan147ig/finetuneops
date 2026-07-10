export type DocSection = {
  heading: string;
  body: string[];
};

export type DocPage = {
  slug: string[];
  title: string;
  description: string;
  category: "Getting Started" | "Regression RCA" | "Tracing" | "Datasets" | "Prompts" | "Releases" | "SDK";
  order: number;
  sections: DocSection[];
};

export const docsPages: DocPage[] = [
  {
    slug: ["getting-started"],
    title: "Getting Started",
    description: "Set up FineTuneOps for a team that ships frontier model, prompt, RAG, and fine-tune releases.",
    category: "Getting Started",
    order: 1,
    sections: [
      {
        heading: "Why teams adopt FineTuneOps",
        body: [
          "FineTuneOps is built around one painful question: why did this LLM release get worse? It compares baseline and candidate evals, identifies likely release changes, and produces evidence that can block or approve promotion.",
          "Fine-tune teams get the deepest workflow through TRA, which ranks suspicious training rows. Frontier-model teams can still use the same regression report for prompt, RAG, model, and eval changes.",
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
    slug: ["regression-rca", "cli-release-gate"],
    title: "CLI Release Gate",
    description: "Generate a regression root-cause report from eval files without adopting the full dashboard first.",
    category: "Regression RCA",
    order: 2,
    sections: [
      {
        heading: "Run the CLI in any eval pipeline",
        body: [
          "Use the SDK package as a command-line gate: finetuneops regression --baseline baseline.jsonl --candidate candidate.jsonl --training train.jsonl --format markdown --output report.md --fail-on-regression.",
          "Baseline and candidate files can be JSON arrays or JSONL rows. Each row may include id, input, output, score, passed, metric, model, promptVersion, retrievalVersion, latency_ms, cost_usd, and metadata.",
        ],
      },
      {
        heading: "What the report explains",
        body: [
          "The report shows the global score drop, highest-impact failed eval cases, changed model, prompt, or retrieval versions, and optional training-data findings such as duplicate conflicts, PII leaks, and unusually long examples.",
          "This makes FineTuneOps useful before a team has connected all traces, auth, billing, and workers. The CLI creates the adoption wedge; the dashboard becomes the evidence archive.",
        ],
      },
    ],
  },
  {
    slug: ["traces", "capture-and-promote"],
    title: "Capture and Promote Traces",
    description: "Turn production failures into the training data that actually matters.",
    category: "Tracing",
    order: 3,
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
    order: 4,
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
    order: 5,
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
    order: 6,
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
    order: 7,
    sections: [
      {
        heading: "Use the SDK for fast adoption",
        body: [
          "The FineTuneOps SDK can wrap OpenAI and Anthropic clients, batch trace capture, fetch current prompt templates by name, and generate local LLM regression reports.",
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
