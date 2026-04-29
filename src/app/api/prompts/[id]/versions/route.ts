import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { canEditPrompts } from "@/lib/authz";
import { createPromptVersion } from "@/lib/prompt-data";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const POST = withApiErrorHandling("prompt_version_create_failed", async (request, rawContext) => {
  const context = rawContext as RouteContext | undefined;
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!canEditPrompts(session.user.role)) {
    return NextResponse.json(
      { error: "Only engineers, admins, or owners can create prompt versions." },
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
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const commitMessage =
    typeof body?.commitMessage === "string" ? body.commitMessage.trim() : "";

  if (!content) {
    return NextResponse.json({ error: "Content is required." }, { status: 400 });
  }

  if (!commitMessage) {
    return NextResponse.json(
      { error: "Commit message is required." },
      { status: 400 },
    );
  }

  const { id } = (await context?.params) as Awaited<RouteContext["params"]>;
  const version = await createPromptVersion(id, {
    organizationId: session.user.organizationId,
    content,
    commitMessage,
    authorId: session.user.id,
  });

  if (!version) {
    return NextResponse.json({ error: "Prompt template not found." }, { status: 404 });
  }

  return NextResponse.json(version, {
    status: 201,
    headers: rateLimitHeaders(rl),
  });
});
