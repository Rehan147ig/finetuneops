import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { canDeployPrompts } from "@/lib/authz";
import { deployPromptVersion } from "@/lib/prompt-data";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{
    id: string;
    versionId: string;
  }>;
};

function isPromptEnvironment(value: string): value is "production" | "staging" | "development" {
  return ["production", "staging", "development"].includes(value);
}

export const POST = withApiErrorHandling("prompt_version_deploy_failed", async (request, rawContext) => {
  const context = rawContext as RouteContext | undefined;
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!canDeployPrompts(session.user.role)) {
    return NextResponse.json(
      { error: "Only reviewers, admins, or owners can deploy prompt versions." },
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
  const environment =
    typeof body?.environment === "string" ? body.environment.trim() : "";

  if (!isPromptEnvironment(environment)) {
    return NextResponse.json(
      { error: "Environment must be production, staging, or development." },
      { status: 400 },
    );
  }

  const { id, versionId } = (await context?.params) as Awaited<RouteContext["params"]>;
  const existingVersion = await prisma.promptVersion.findFirst({
    where: {
      id: versionId,
      promptTemplateId: id,
      template: {
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
    },
    select: {
      id: true,
    },
  });

  if (!existingVersion) {
    return NextResponse.json({ error: "Prompt version not found." }, { status: 404 });
  }

  const deployedVersion = await deployPromptVersion(
    session.user.organizationId,
    versionId,
    environment,
    session.user.id,
  );

  if (!deployedVersion) {
    return NextResponse.json({ error: "Prompt version not found." }, { status: 404 });
  }

  return NextResponse.json(deployedVersion, {
    status: 200,
    headers: rateLimitHeaders(rl),
  });
});
