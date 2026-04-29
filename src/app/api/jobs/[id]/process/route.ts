import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { processBackgroundJobById } from "@/lib/background-jobs";
import { canManageWorkspace } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const POST = withApiErrorHandling("background_job_process_failed", async (_request: Request, context?: unknown) => {
  const session = await auth();

  if (!session?.user?.organizationId || !session.user.role) {
    return NextResponse.json(
      {
        error: "Authentication required.",
      },
      { status: 401 },
    );
  }

  if (!canManageWorkspace(session.user.role)) {
    return NextResponse.json(
      {
        error: "Only workspace managers can process background jobs.",
      },
      { status: 403 },
    );
  }

  const rl = await checkRateLimit(session.user.organizationId, "admin");

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "API rate limit exceeded", retryAfter: 60 },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const { id } = await (context as RouteContext).params;

  if (!id) {
    return NextResponse.json(
      {
        error: "Background job id is required.",
      },
      { status: 400 },
    );
  }

  const backgroundJob = await prisma.backgroundJob.findFirst({
    where: {
      id,
      organizationId: session.user.organizationId,
    },
  });

  if (!backgroundJob) {
    return NextResponse.json(
      {
        error: "Background job not found in this workspace.",
      },
      { status: 404 },
    );
  }

  if (backgroundJob.status === "completed") {
    return NextResponse.json(
      {
        error: "This background job has already completed.",
      },
      { status: 409 },
    );
  }

  await processBackgroundJobById(backgroundJob.id);

  return NextResponse.json(
    {
      id: backgroundJob.id,
      status: "processed",
    },
    { status: 200, headers: rateLimitHeaders(rl) },
  );
});
