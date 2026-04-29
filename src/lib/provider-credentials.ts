import { prisma } from "@/lib/prisma";
import { decryptKey, encryptKey } from "@/lib/encryption";

export const providerNames = ["openai", "anthropic", "huggingface"] as const;

export type ProviderName = (typeof providerNames)[number];

export type ProviderCredentialListItem = {
  id: string;
  provider: ProviderName;
  label: string;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  createdAt: Date;
};

export function isProviderName(value: string): value is ProviderName {
  return providerNames.includes(value as ProviderName);
}

export async function createProviderCredential(input: {
  workspaceId: string;
  provider: ProviderName;
  label: string;
  apiKey: string;
  createdBy: string;
}) {
  const encrypted = encryptKey(input.apiKey);

  return prisma.providerCredential.create({
    data: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      label: input.label,
      encryptedKey: encrypted.encrypted,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      createdBy: input.createdBy,
    },
    select: {
      id: true,
      provider: true,
      label: true,
      createdAt: true,
    },
  });
}

export async function listProviderCredentials(workspaceId: string): Promise<ProviderCredentialListItem[]> {
  const credentials = await prisma.providerCredential.findMany({
    where: {
      workspaceId,
      isActive: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      provider: true,
      label: true,
      isActive: true,
      lastTestedAt: true,
      lastTestOk: true,
      createdAt: true,
    },
  });

  return credentials.map((credential) => ({
    ...credential,
    provider: credential.provider as ProviderName,
  }));
}

export async function deactivateProviderCredential(id: string, workspaceId: string) {
  const credential = await prisma.providerCredential.findFirst({
    where: {
      id,
      workspaceId,
      isActive: true,
    },
  });

  if (!credential) {
    return null;
  }

  return prisma.providerCredential.update({
    where: {
      id: credential.id,
    },
    data: {
      isActive: false,
    },
    select: {
      id: true,
    },
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyProviderCredential(provider: ProviderName, apiKey: string) {
  switch (provider) {
    case "openai": {
      const response = await fetchWithTimeout("https://api.openai.com/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      return response.ok
        ? { ok: true as const }
        : { ok: false as const, error: "Invalid API key" };
    }
    case "anthropic": {
      const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      });

      return response.ok
        ? { ok: true as const }
        : { ok: false as const, error: "Invalid API key" };
    }
    case "huggingface": {
      const response = await fetchWithTimeout("https://huggingface.co/api/whoami-v2", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      return response.ok
        ? { ok: true as const }
        : { ok: false as const, error: "Invalid API key" };
    }
  }
}

export async function testProviderCredential(id: string, workspaceId: string) {
  const credential = await prisma.providerCredential.findFirst({
    where: {
      id,
      workspaceId,
      isActive: true,
    },
  });

  if (!credential) {
    return {
      ok: false,
      error: "Credential not found",
    };
  }

  try {
    const apiKey = decryptKey(credential.encryptedKey, credential.iv, credential.authTag);
    const result = await verifyProviderCredential(credential.provider as ProviderName, apiKey);

    await prisma.providerCredential.update({
      where: {
        id: credential.id,
      },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: result.ok,
      },
    });

    return result;
  } catch {
    await prisma.providerCredential.update({
      where: {
        id: credential.id,
      },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: false,
      },
    });

    return {
      ok: false,
      error: "Invalid API key",
    };
  }
}

export async function getActiveCredential(
  workspaceId: string,
  provider: ProviderName,
): Promise<string | null> {
  const credential = await prisma.providerCredential.findFirst({
    where: {
      workspaceId,
      provider,
      isActive: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!credential) {
    return null;
  }

  return decryptKey(credential.encryptedKey, credential.iv, credential.authTag);
}
