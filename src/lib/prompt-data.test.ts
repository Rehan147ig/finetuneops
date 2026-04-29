import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  invalidate,
  invalidatePattern,
  recordActivityEvent,
  logAuditEvent,
} = vi.hoisted(() => {
  const transactionClient = {
    promptTemplate: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    promptVersion: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    mockPrisma: {
      promptTemplate: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      promptVersion: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      project: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (client: typeof transactionClient) => unknown) =>
        callback(transactionClient),
      ),
      __tx: transactionClient,
    },
    invalidate: vi.fn(),
    invalidatePattern: vi.fn(),
    recordActivityEvent: vi.fn(),
    logAuditEvent: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/cache", () => ({
  cached: vi.fn(async (_key, _ttl, fn: () => Promise<unknown>) => fn()),
  invalidate,
  invalidatePattern,
}));

vi.mock("@/lib/workspace-data", () => ({
  recordActivityEvent,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent,
}));

import {
  createPromptTemplate,
  createPromptVersion,
  deployPromptVersion,
  diffPromptVersions,
  extractVariables,
} from "@/lib/prompt-data";

describe("prompt data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.project.findFirst.mockResolvedValue({ id: "project_1" });
  });

  it("createPromptTemplate creates template and v1", async () => {
    mockPrisma.__tx.promptTemplate.create.mockResolvedValue({
      id: "template_1",
      organizationId: "org_1",
      projectId: "project_1",
      name: "customer-support",
      description: "Support prompt",
      currentVersionId: null,
      createdAt: new Date("2026-04-24T10:00:00.000Z"),
      updatedAt: new Date("2026-04-24T10:00:00.000Z"),
      deletedAt: null,
      createdBy: "user_1",
    });
    mockPrisma.__tx.promptVersion.create.mockResolvedValue({
      id: "version_1",
      promptTemplateId: "template_1",
      version: "v1",
      content: "Hello {{name}}",
      variables: ["name"],
      commitMessage: "Initial version",
      authorId: "user_1",
      parentVersionId: null,
      createdAt: new Date("2026-04-24T10:00:00.000Z"),
      evalScore: null,
      latencyMs: null,
      deployedAt: null,
      deployedBy: null,
      environment: null,
    });
    mockPrisma.__tx.promptTemplate.findUnique.mockResolvedValue({
      id: "template_1",
      organizationId: "org_1",
      projectId: "project_1",
      name: "customer-support",
      description: "Support prompt",
      currentVersionId: "version_1",
      createdAt: new Date("2026-04-24T10:00:00.000Z"),
      updatedAt: new Date("2026-04-24T10:00:00.000Z"),
      deletedAt: null,
      createdBy: "user_1",
      currentVersion: {
        id: "version_1",
        version: "v1",
      },
      versions: [
        {
          id: "version_1",
          version: "v1",
        },
      ],
    });

    const result = await createPromptTemplate("org_1", {
      name: "customer-support",
      description: "Support prompt",
      content: "Hello {{name}}",
      commitMessage: "Initial version",
      createdBy: "user_1",
      projectId: "project_1",
    });

    expect(result?.currentVersionId).toBe("version_1");
    expect(mockPrisma.__tx.promptVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: "v1",
        }),
      }),
    );
    expect(mockPrisma.__tx.promptTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentVersionId: "version_1",
        }),
      }),
    );
  });

  it("createPromptVersion increments version correctly", async () => {
    mockPrisma.promptTemplate.findFirst.mockResolvedValue({
      id: "template_1",
      organizationId: "org_1",
      projectId: "project_1",
      name: "customer-support",
      description: null,
      currentVersionId: "version_3",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: "user_1",
      versions: [
        {
          id: "version_3",
          version: "v3",
        },
      ],
    });
    mockPrisma.promptVersion.create.mockResolvedValue({
      id: "version_4",
      version: "v4",
    });

    const result = await createPromptVersion("template_1", {
      organizationId: "org_1",
      content: "Updated prompt",
      commitMessage: "Tune tone",
      authorId: "user_1",
    });

    expect(result?.version).toBe("v4");
    expect(mockPrisma.promptVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: "v4",
          parentVersionId: "version_3",
        }),
      }),
    );
  });

  it("deployPromptVersion updates currentVersionId", async () => {
    mockPrisma.promptVersion.findFirst.mockResolvedValue({
      id: "version_3",
      promptTemplateId: "template_1",
      version: "v3",
      content: "Prompt",
      variables: [],
      commitMessage: "Ship it",
      authorId: "user_1",
      parentVersionId: "version_2",
      createdAt: new Date(),
      evalScore: 0.9,
      latencyMs: 120,
      deployedAt: null,
      deployedBy: null,
      environment: null,
      template: {
        id: "template_1",
        organizationId: "org_1",
        projectId: "project_1",
        name: "customer-support",
        description: null,
        currentVersionId: "version_2",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: "user_1",
      },
    });
    mockPrisma.__tx.promptVersion.update.mockResolvedValue({
      id: "version_3",
      environment: "production",
    });

    const result = await deployPromptVersion(
      "org_1",
      "version_3",
      "production",
      "user_2",
    );

    expect(result?.environment).toBe("production");
    expect(mockPrisma.__tx.promptTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentVersionId: "version_3",
        }),
      }),
    );
  });

  it("diffPromptVersions detects added lines", () => {
    const result = diffPromptVersions(
      "line 1\nline 2\nline 3",
      "line 1\nline 2\nline 3\nline 4\nline 5",
    );

    expect(result.added).toEqual(["line 4", "line 5"]);
    expect(result.removed).toEqual([]);
    expect(result.unchanged).toEqual(["line 1", "line 2", "line 3"]);
  });

  it("diffPromptVersions detects removed lines", () => {
    const result = diffPromptVersions(
      "line 1\nline 2\nline 3\nline 4",
      "line 1\nline 3",
    );

    expect(result.removed).toEqual(["line 2", "line 4"]);
  });

  it("diffPromptVersions detects changed lines", () => {
    const result = diffPromptVersions(
      "line 1\nline 2\nline 3",
      "line 1\nline changed\nline 3",
    );

    expect(result.removed).toContain("line 2");
    expect(result.added).toContain("line changed");
  });

  it("extractVariables finds all variables", () => {
    expect(extractVariables("Hello {{name}}, your {{item}} is ready")).toEqual([
      "name",
      "item",
    ]);
  });

  it("extractVariables returns empty for no variables", () => {
    expect(extractVariables("No placeholders here")).toEqual([]);
  });

  it("extractVariables deduplicates repeated variables", () => {
    expect(extractVariables("{{name}} met {{name}} about {{topic}}")).toEqual([
      "name",
      "topic",
    ]);
  });
});
