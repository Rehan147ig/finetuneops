import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export type GeneratedApiKey = {
  plaintext: string;
  keyPrefix: string;
  lastFour: string;
  keyHash: string;
};

export function generateWorkspaceApiKey(live = true): GeneratedApiKey {
  const keyPrefix = live ? "fto_live" : "fto_test";
  const secret = crypto.randomBytes(18).toString("base64url");
  const plaintext = `${keyPrefix}_${secret}`;
  const lastFour = plaintext.slice(-4);
  const keyHash = hashWorkspaceApiKey(plaintext);

  return {
    plaintext,
    keyPrefix,
    lastFour,
    keyHash,
  };
}

export function hashWorkspaceApiKey(plaintext: string) {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export async function createWorkspaceApiKey(input: {
  organizationId: string;
  createdByUserId: string;
  name: string;
  live?: boolean;
}) {
  const generated = generateWorkspaceApiKey(input.live ?? process.env.NODE_ENV === "production");

  const apiKey = await prisma.apiKey.create({
    data: {
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      lastFour: generated.lastFour,
    },
  });

  return {
    apiKey,
    plaintext: generated.plaintext,
  };
}

export async function revokeWorkspaceApiKey(id: string, organizationId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id,
      organizationId,
    },
    select: {
      id: true,
    },
  });

  if (!apiKey) {
    return null;
  }

  return prisma.apiKey.update({
    where: {
      id: apiKey.id,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function authenticateWorkspaceApiKey(plaintext: string) {
  const keyHash = hashWorkspaceApiKey(plaintext);

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      revokedAt: null,
    },
    include: {
      organization: {
        include: {
          projects: {
            orderBy: {
              createdAt: "asc",
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!apiKey) {
    return null;
  }

  await prisma.apiKey.update({
    where: {
      id: apiKey.id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });

  return {
    organizationId: apiKey.organizationId,
    projectId: apiKey.organization.projects[0]?.id,
    apiKeyId: apiKey.id,
  };
}
