import type { PromptTemplate, PromptVersion } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { cached, invalidate, invalidatePattern } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import {
  diffPromptVersions as buildPromptDiff,
  extractVariables as findPromptVariables,
  type PromptVersionDiff,
} from "@/lib/prompt-utils";
import { recordActivityEvent } from "@/lib/workspace-data";

const PromptCacheTTL = {
  templates: 60,
  template: 30,
} as const;

const PromptCacheKeys = {
  templates: (organizationId: string) => `cache:prompts:${organizationId}:templates`,
  template: (organizationId: string, templateId: string) =>
    `cache:prompts:${organizationId}:template:${templateId}`,
  all: (organizationId: string) => `cache:prompts:${organizationId}:*`,
} as const;

export type PromptVersionWithDiff = PromptVersion & {
  diff?: PromptVersionDiff;
};

export type PromptTemplateSummary = PromptTemplate & {
  currentVersion: PromptVersion | null;
  versionCount: number;
  variableCount: number;
  currentEnvironment: string | null;
};

export type PromptTemplateDetail = PromptTemplate & {
  currentVersion: PromptVersion | null;
  versions: PromptVersion[];
};

type CreatePromptTemplateInput = {
  name: string;
  description?: string;
  content: string;
  commitMessage: string;
  createdBy: string;
  projectId?: string | null;
};

type CreatePromptVersionInput = {
  organizationId: string;
  content: string;
  commitMessage: string;
  authorId: string;
};

function normalizePromptTemplateSummary(
  template: PromptTemplate & {
    currentVersion: PromptVersion | null;
    _count: {
      versions: number;
    };
  },
): PromptTemplateSummary {
  const { _count, ...rest } = template;

  return {
    ...rest,
    versionCount: _count.versions,
    variableCount: template.currentVersion?.variables.length ?? 0,
    currentEnvironment: template.currentVersion?.environment ?? null,
  };
}

async function invalidatePromptCaches(organizationId: string, templateId?: string) {
  await invalidate(PromptCacheKeys.templates(organizationId));

  if (templateId) {
    await invalidate(PromptCacheKeys.template(organizationId, templateId));
  }
}

async function invalidateAllPromptCaches(organizationId: string) {
  await invalidatePattern(PromptCacheKeys.all(organizationId));
}

async function getActivityProjectId(
  organizationId: string,
  projectId?: string | null,
): Promise<string | null> {
  if (projectId) {
    return projectId;
  }

  const project = await prisma.project.findFirst({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  return project?.id ?? null;
}

async function logPromptActivity(input: {
  organizationId: string;
  projectId?: string | null;
  userId: string;
  type: "prompt_template_created" | "prompt_version_created" | "prompt_version_deployed";
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const activityProjectId = await getActivityProjectId(input.organizationId, input.projectId);

  if (!activityProjectId) {
    return;
  }

  await recordActivityEvent({
    projectId: activityProjectId,
    type: input.type,
    message: input.message,
    userId: input.userId,
    metadata: input.metadata,
  });
}

function parseVersionNumber(version: string) {
  const match = /^v(\d+)$/i.exec(version.trim());
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function toPromptVersionTag(versionNumber: number) {
  return `v${versionNumber}`;
}

export function diffPromptVersions(versionA: string, versionB: string): PromptVersionDiff {
  return buildPromptDiff(versionA, versionB);
}

export function extractVariables(content: string) {
  return findPromptVariables(content);
}

export async function getPromptTemplates(organizationId: string): Promise<PromptTemplateSummary[]> {
  return cached(
    PromptCacheKeys.templates(organizationId),
    PromptCacheTTL.templates,
    async () => {
      try {
        const templates = await prisma.promptTemplate.findMany({
          where: {
            organizationId,
            deletedAt: null,
          },
          include: {
            currentVersion: true,
            _count: {
              select: {
                versions: true,
              },
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
        });

        return templates.map(normalizePromptTemplateSummary);
      } catch {
        return [];
      }
    },
  );
}

export async function getPromptTemplate(
  organizationId: string,
  templateId: string,
): Promise<PromptTemplateDetail | null> {
  return cached(
    PromptCacheKeys.template(organizationId, templateId),
    PromptCacheTTL.template,
    async () => {
      try {
        return await prisma.promptTemplate.findFirst({
          where: {
            id: templateId,
            organizationId,
            deletedAt: null,
          },
          include: {
            currentVersion: true,
            versions: {
              orderBy: {
                createdAt: "desc",
              },
            },
          },
        });
      } catch {
        return null;
      }
    },
  );
}

export async function getPromptVersion(versionId: string): Promise<PromptVersion | null> {
  try {
    return await prisma.promptVersion.findUnique({
      where: {
        id: versionId,
      },
    });
  } catch {
    return null;
  }
}

export async function createPromptTemplate(
  organizationId: string,
  data: CreatePromptTemplateInput,
): Promise<PromptTemplateDetail | null> {
  try {
    const template = await prisma.$transaction(async (tx) => {
      const createdTemplate = await tx.promptTemplate.create({
        data: {
          organizationId,
          projectId: data.projectId ?? null,
          name: data.name,
          description: data.description?.trim() || null,
          createdBy: data.createdBy,
        },
      });

      const firstVersion = await tx.promptVersion.create({
        data: {
          promptTemplateId: createdTemplate.id,
          version: "v1",
          content: data.content,
          variables: extractVariables(data.content),
          commitMessage: data.commitMessage,
          authorId: data.createdBy,
        },
      });

      await tx.promptTemplate.update({
        where: {
          id: createdTemplate.id,
        },
        data: {
          currentVersionId: firstVersion.id,
        },
      });

      return tx.promptTemplate.findUnique({
        where: {
          id: createdTemplate.id,
        },
        include: {
          currentVersion: true,
          versions: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });
    });

    await logPromptActivity({
      organizationId,
      projectId: data.projectId,
      userId: data.createdBy,
      type: "prompt_template_created",
      message: `${data.name} was created with version v1.`,
      metadata: {
        templateName: data.name,
      },
    });
    await logAuditEvent({
      organizationId,
      actorUserId: data.createdBy,
      action: "prompt_template_created",
      targetType: "prompt_template",
      targetId: template?.id ?? null,
      targetName: data.name,
      metadata: {
        projectId: data.projectId ?? null,
        currentVersionId: template?.currentVersionId ?? null,
      },
    });
    await invalidatePromptCaches(organizationId, template?.id);

    return template;
  } catch {
    return null;
  }
}

export async function createPromptVersion(
  templateId: string,
  data: CreatePromptVersionInput,
): Promise<PromptVersion | null> {
  try {
    const template = await prisma.promptTemplate.findFirst({
      where: {
        id: templateId,
        organizationId: data.organizationId,
        deletedAt: null,
      },
      include: {
        versions: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    if (!template) {
      return null;
    }

    const latestVersion = template.versions[0] ?? null;
    const nextVersionNumber = (latestVersion ? parseVersionNumber(latestVersion.version) : 0) + 1;

    const version = await prisma.promptVersion.create({
      data: {
        promptTemplateId: template.id,
        version: toPromptVersionTag(nextVersionNumber),
        content: data.content,
        variables: extractVariables(data.content),
        commitMessage: data.commitMessage,
        authorId: data.authorId,
        parentVersionId: latestVersion?.id ?? null,
      },
    });

    await logPromptActivity({
      organizationId: data.organizationId,
      projectId: template.projectId,
      userId: data.authorId,
      type: "prompt_version_created",
      message: `${template.name} received ${version.version}.`,
      metadata: {
        templateId: template.id,
        version: version.version,
      },
    });
    await logAuditEvent({
      organizationId: data.organizationId,
      actorUserId: data.authorId,
      action: "prompt_version_created",
      targetType: "prompt_version",
      targetId: version.id,
      targetName: `${template.name} ${version.version}`,
      metadata: {
        promptTemplateId: template.id,
        parentVersionId: latestVersion?.id ?? null,
      },
    });
    await invalidatePromptCaches(data.organizationId, template.id);

    return version;
  } catch {
    return null;
  }
}

export async function deployPromptVersion(
  organizationId: string,
  versionId: string,
  environment: "production" | "staging" | "development",
  deployedBy: string,
): Promise<PromptVersion | null> {
  try {
    const version = await prisma.promptVersion.findFirst({
      where: {
        id: versionId,
        template: {
          organizationId,
          deletedAt: null,
        },
      },
      include: {
        template: true,
      },
    });

    if (!version) {
      return null;
    }

    const deployedVersion = await prisma.$transaction(async (tx) => {
      const updatedVersion = await tx.promptVersion.update({
        where: {
          id: version.id,
        },
        data: {
          deployedAt: new Date(),
          deployedBy,
          environment,
        },
      });

      await tx.promptTemplate.update({
        where: {
          id: version.promptTemplateId,
        },
        data: {
          currentVersionId: version.id,
        },
      });

      return updatedVersion;
    });

    await logPromptActivity({
      organizationId,
      projectId: version.template.projectId,
      userId: deployedBy,
      type: "prompt_version_deployed",
      message: `${version.template.name} ${version.version} was deployed to ${environment}.`,
      metadata: {
        templateId: version.template.id,
        versionId: version.id,
        environment,
      },
    });
    await logAuditEvent({
      organizationId,
      actorUserId: deployedBy,
      action: "prompt_version_deployed",
      targetType: "prompt_version",
      targetId: version.id,
      targetName: `${version.template.name} ${version.version}`,
      metadata: {
        promptTemplateId: version.template.id,
        environment,
      },
    });
    await invalidateAllPromptCaches(organizationId);

    return deployedVersion;
  } catch {
    return null;
  }
}
