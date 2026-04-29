import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const GET = withApiErrorHandling("trace_detail_failed", async (_request: Request, context?: unknown) => {
  const session = await auth();
  const { id } = await (context as RouteContext).params;

  if (!session?.user?.organizationId) {
    return NextResponse.json(
      {
        error: "You must be signed in to view traces.",
      },
      { status: 401 },
    );
  }

  if (!id) {
    return NextResponse.json(
      {
        error: "Trace id is required.",
      },
      { status: 400 },
    );
  }

  const trace = await prisma.traceEvent.findFirst({
    where: {
      id,
      project: {
        organizationId: session.user.organizationId,
      },
    },
  });

  if (!trace) {
    return NextResponse.json(
      {
        error: "Trace not found.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      trace,
    },
    { status: 200 },
  );
});
