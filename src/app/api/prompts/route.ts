import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authenticateWorkspaceApiKey } from "@/lib/api-keys";
import { withApiErrorHandling } from "@/lib/api-handler";
import { canEditPrompts } from "@/lib/authz";
import {
  createPromptTemplate,
  getPromptTemplates,
} from "@/lib/prompt-data";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

async function resolveReadOrganizationId(request: Request) {
  const apiKey =
    request.headers.get("x-api-key") ?? request.headers.get("x-finetuneops-key");

  if (apiKey) {
    const apiKeyScope = await authenticateWorkspaceApiKey(apiKey);
    if (apiKeyScope?.organizationId) {
      return apiKeyScope.organizationId;
    }
  }

  const session = await auth();
  return session?.user?.organizationId ?? null;
}

export const GET = withApiErrorHandling("prompts_list_failed", async (request) => {
  const organizationId = await resolveReadOrganizationId(request);

  if (!organizationId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const rl = await checkRateLimit(organizationId, "api");

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "API rate limit exceeded", retryAfter: 60 },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const { searchParams } = new URL(request.url);
  const requestedName = searchParams.get("name")?.trim().toLowerCase();
  const templates = await getPromptTemplates(organizationId);
  const filteredTemplates = requestedName
    ? templates.filter((template) => template.name.toLowerCase() === requestedName)
    : templates;

  return NextResponse.json(filteredTemplates, {
    status: 200,
    headers: rateLimitHeaders(rl),
  });
});

export const POST = withApiErrorHandling("prompt_create_failed", async (request) => {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!canEditPrompts(session.user.role)) {
    return NextResponse.json(
      { error: "Only engineers, admins, or owners can create prompt templates." },
      { status: 403 },
    );
  }

  const rl = await checkRateLimit(session.user.organizationId, "api");

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "API rate limit exceeded", retryAfter: 60 },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const commitMessage =
    typeof body?.commitMessage === "string" ? body.commitMessage.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  if (!content) {
    return NextResponse.json({ error: "Content is required." }, { status: 400 });
  }

  if (!commitMessage) {
    return NextResponse.json(
      { error: "Commit message is required." },
      { status: 400 },
    );
  }

  const project = await prisma.project.findFirst({
    where: {
      organizationId: session.user.organizationId,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  const template = await createPromptTemplate(session.user.organizationId, {
    name,
    description,
    content,
    commitMessage,
    createdBy: session.user.id,
    projectId: project?.id ?? null,
  });

  if (!template) {
    return NextResponse.json(
      { error: "Prompt template could not be created." },
      { status: 500 },
    );
  }

  return NextResponse.json(template, {
    status: 201,
    headers: rateLimitHeaders(rl),
  });
});
