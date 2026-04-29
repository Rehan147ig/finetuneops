import type { Prisma } from "@prisma/client";
import { cached, invalidatePattern } from "@/lib/cache";
import { getDocsSearchDocuments } from "@/lib/docs-content";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const SEARCH_DIMENSIONS = 64;
const SearchCacheTTL = {
  docs: 300,
  workspace: 60,
} as const;

export type SearchResult = {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  snippet: string;
  href: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type SearchDocumentStats = {
  publicDocuments: number;
  workspaceDocuments: number;
  bySourceType: Array<{
    sourceType: string;
    count: number;
  }>;
  lastIndexedAt: string | null;
};

type SearchDocumentRecord = {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  slug: string | null;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};

function toInputJsonValue(value: Record<string, unknown> | undefined) {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hashToken(token: string) {
  let hash = 0;

  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function embedText(text: string) {
  const vector = new Array<number>(SEARCH_DIMENSIONS).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const bucket = hashToken(token) % SEARCH_DIMENSIONS;
    vector[bucket] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (!magnitude) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }

  let score = 0;

  for (let index = 0; index < left.length; index += 1) {
    score += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return Number(score.toFixed(6));
}

function safeMetadata(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function safeEmbedding(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

function buildSnippet(content: string, query: string) {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  const normalizedQuery = query.trim().toLowerCase();
  const foundIndex = normalizedContent.toLowerCase().indexOf(normalizedQuery);

  if (foundIndex === -1) {
    return normalizedContent.slice(0, 180);
  }

  const start = Math.max(0, foundIndex - 60);
  const end = Math.min(normalizedContent.length, foundIndex + normalizedQuery.length + 120);
  return normalizedContent.slice(start, end);
}

function toSearchResult(document: SearchDocumentRecord, query: string, score: number): SearchResult {
  return {
    id: document.id,
    sourceType: document.sourceType,
    sourceId: document.sourceId,
    title: document.title,
    snippet: buildSnippet(document.content, query),
    href: document.slug ?? "#",
    score,
    metadata: document.metadata,
  };
}

function docsCacheKey(query: string, limit: number) {
  return `cache:search:docs:${query.toLowerCase()}:${limit}`;
}

function workspaceCacheKey(organizationId: string, query: string, limit: number) {
  return `cache:search:${organizationId}:${query.toLowerCase()}:${limit}`;
}

async function upsertSearchDocument(input: {
  organizationId?: string | null;
  projectId?: string | null;
  sourceType: string;
  sourceId: string;
  title: string;
  slug?: string | null;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.searchDocument.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
    create: {
      organizationId: input.organizationId ?? null,
      projectId: input.projectId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      title: input.title,
      slug: input.slug ?? null,
      content: input.content,
      embedding: embedText(`${input.title}\n${input.content}`),
      metadata: toInputJsonValue(input.metadata),
    },
    update: {
      organizationId: input.organizationId ?? null,
      projectId: input.projectId ?? null,
      title: input.title,
      slug: input.slug ?? null,
      content: input.content,
      embedding: embedText(`${input.title}\n${input.content}`),
      metadata: toInputJsonValue(input.metadata),
    },
  });
}

async function countSearchDocuments(where: Prisma.SearchDocumentWhereInput) {
  const [documents, aggregates] = await Promise.all([
    prisma.searchDocument.count({ where }),
    prisma.searchDocument.groupBy({
      by: ["sourceType"],
      where,
      _count: {
        sourceType: true,
      },
    }),
  ]);

  return {
    documents,
    bySourceType: aggregates.map((item) => ({
      sourceType: item.sourceType,
      count: item._count.sourceType,
    })),
  };
}

export async function syncDocsSearchIndex() {
  try {
    const documents = getDocsSearchDocuments();
    await Promise.all(
      documents.map((document) =>
        upsertSearchDocument({
          sourceType: document.sourceType,
          sourceId: document.sourceId,
          title: document.title,
          slug: document.slug,
          content: document.content,
          metadata: document.metadata,
        }),
      ),
    );
  } catch (error) {
    logger.warn({
      event: "search_index_sync_failed",
      scope: "docs",
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function syncWorkspaceSearchIndex(organizationId: string) {
  try {
    const [traces, datasets, prompts] = await Promise.all([
      prisma.traceEvent.findMany({
        where: {
          project: {
            organizationId,
          },
        },
        include: {
          project: {
            select: {
              id: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 100,
      }),
      prisma.dataset.findMany({
        where: {
          project: {
            organizationId,
          },
        },
        include: {
          project: {
            select: {
              id: true,
            },
          },
          qualityReport: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 100,
      }),
      prisma.promptTemplate.findMany({
        where: {
          organizationId,
          deletedAt: null,
        },
        include: {
          currentVersion: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 100,
      }),
    ]);

    await Promise.all([
      ...traces.map((trace) =>
        upsertSearchDocument({
          organizationId,
          projectId: trace.project.id,
          sourceType: "trace_event",
          sourceId: trace.id,
          title: trace.title,
          slug: `/traces`,
          content: [trace.inputText ?? "", trace.outputText ?? "", trace.source].join("\n\n"),
          metadata: {
            modelName: trace.modelName,
            status: trace.status,
            severity: trace.severity,
          },
        }),
      ),
      ...datasets.map((dataset) =>
        upsertSearchDocument({
          organizationId,
          projectId: dataset.project.id,
          sourceType: "dataset",
          sourceId: dataset.id,
          title: `${dataset.name} ${dataset.version}`,
          slug: `/datasets/${dataset.id}`,
          content: [
            dataset.source ?? "",
            dataset.status,
            dataset.qualityReport?.recommendation ?? "",
          ].join("\n\n"),
          metadata: {
            qualityScore: dataset.qualityReport?.healthScore ?? dataset.qualityScore ?? 0,
            rowCount: dataset.rowCount,
          },
        }),
      ),
      ...prompts.map((template) =>
        upsertSearchDocument({
          organizationId,
          projectId: template.projectId,
          sourceType: "prompt_template",
          sourceId: template.id,
          title: template.name,
          slug: `/prompts/${template.id}`,
          content: [template.description ?? "", template.currentVersion?.content ?? ""].join("\n\n"),
          metadata: {
            currentVersion: template.currentVersion?.version ?? null,
            environment: template.currentVersion?.environment ?? null,
          },
        }),
      ),
    ]);
  } catch (error) {
    logger.warn({
      event: "search_index_sync_failed",
      scope: "workspace",
      organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

async function ensureDocsSearchIndex() {
  const publicDocsCount = await prisma.searchDocument.count({
    where: {
      organizationId: null,
    },
  });

  if (publicDocsCount === 0) {
    await syncDocsSearchIndex();
  }
}

async function ensureWorkspaceSearchIndex(organizationId: string) {
  const workspaceDocsCount = await prisma.searchDocument.count({
    where: {
      organizationId,
    },
  });

  if (workspaceDocsCount === 0) {
    await syncWorkspaceSearchIndex(organizationId);
  }
}

export async function getSearchDocumentStats(
  organizationId?: string,
): Promise<SearchDocumentStats> {
  try {
    const publicWhere: Prisma.SearchDocumentWhereInput = {
      organizationId: null,
    };
    const workspaceWhere: Prisma.SearchDocumentWhereInput = organizationId
      ? { organizationId }
      : { organizationId: { not: null } };

    const [publicCounts, workspaceCounts, latest] = await Promise.all([
      countSearchDocuments(publicWhere),
      countSearchDocuments(workspaceWhere),
      prisma.searchDocument.findFirst({
        where: organizationId
          ? {
              OR: [{ organizationId }, { organizationId: null }],
            }
          : undefined,
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          updatedAt: true,
        },
      }),
    ]);

    const sourceTypeMap = new Map<string, number>();

    for (const bucket of [...publicCounts.bySourceType, ...workspaceCounts.bySourceType]) {
      sourceTypeMap.set(bucket.sourceType, (sourceTypeMap.get(bucket.sourceType) ?? 0) + bucket.count);
    }

    return {
      publicDocuments: publicCounts.documents,
      workspaceDocuments: workspaceCounts.documents,
      bySourceType: Array.from(sourceTypeMap.entries())
        .map(([sourceType, count]) => ({ sourceType, count }))
        .sort((left, right) => right.count - left.count),
      lastIndexedAt: latest?.updatedAt.toISOString() ?? null,
    };
  } catch (error) {
    logger.warn({
      event: "search_index_stats_failed",
      organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      publicDocuments: 0,
      workspaceDocuments: 0,
      bySourceType: [],
      lastIndexedAt: null,
    };
  }
}

export async function reindexSearchDocuments(organizationId: string) {
  await Promise.all([syncDocsSearchIndex(), syncWorkspaceSearchIndex(organizationId)]);
  await Promise.all([
    invalidatePattern("cache:search:docs:*"),
    invalidatePattern(`cache:search:${organizationId}:*`),
  ]);
  return getSearchDocumentStats(organizationId);
}

async function searchIndexedDocuments(input: {
  query: string;
  limit?: number;
  organizationId?: string;
  includePublic?: boolean;
}) {
  const queryEmbedding = embedText(input.query);
  const whereClause: Prisma.SearchDocumentWhereInput = input.organizationId
    ? {
        OR: [
          { organizationId: input.organizationId },
          input.includePublic === false ? undefined : { organizationId: null },
        ].filter(Boolean) as Prisma.SearchDocumentWhereInput[],
      }
    : {
        organizationId: null,
      };

  const documents = await prisma.searchDocument.findMany({
    where: whereClause,
    orderBy: {
      updatedAt: "desc",
    },
    take: 250,
  });

  return documents
    .map((document) => {
      const embedding = safeEmbedding(document.embedding);
      const score = cosineSimilarity(queryEmbedding, embedding);

      return {
        document: {
          id: document.id,
          sourceType: document.sourceType,
          sourceId: document.sourceId,
          title: document.title,
          slug: document.slug,
          content: document.content,
          embedding,
          metadata: safeMetadata(document.metadata),
        } satisfies SearchDocumentRecord,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit ?? 8)
    .map((item) => toSearchResult(item.document, input.query, item.score));
}

export async function searchDocs(query: string, limit = 8) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  await ensureDocsSearchIndex();

  return cached(docsCacheKey(trimmedQuery, limit), SearchCacheTTL.docs, async () => {
    try {
      return await searchIndexedDocuments({
        query: trimmedQuery,
        limit,
      });
    } catch (error) {
      logger.warn({
        event: "search_query_failed",
        scope: "docs",
        error: error instanceof Error ? error.message : "unknown",
      });
      return [];
    }
  });
}

export async function searchWorkspace(
  organizationId: string,
  query: string,
  limit = 10,
) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  await Promise.all([ensureDocsSearchIndex(), ensureWorkspaceSearchIndex(organizationId)]);

  return cached(
    workspaceCacheKey(organizationId, trimmedQuery, limit),
    SearchCacheTTL.workspace,
    async () => {
      try {
        return await searchIndexedDocuments({
          organizationId,
          includePublic: true,
          query: trimmedQuery,
          limit,
        });
      } catch (error) {
        logger.warn({
          event: "search_query_failed",
          scope: "workspace",
          organizationId,
          error: error instanceof Error ? error.message : "unknown",
        });
        return [];
      }
    },
  );
}
