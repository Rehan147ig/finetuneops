import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { getTracePage } from "@/lib/workspace-data";
import {
  traceOpportunityFromSeverity,
  validateTraceInput,
} from "@/lib/workflow-rules";

export const GET = withApiErrorHandling("traces_list_failed", async (request: Request) => {
  const session = await auth();
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || undefined;
  const rawLimit = Number(url.searchParams.get("limit") || "20");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;

  let organizationId = session?.user?.organizationId;

  if (!organizationId) {
    const project = await prisma.project.findFirst({
      orderBy: {
        createdAt: "asc",
      },
      select: {
        organizationId: true,
      },
    });

    organizationId = project?.organizationId;
  }

  if (!organizationId) {
    return NextResponse.json({ traces: [], nextCursor: null });
  }

  const tracePage = await getTracePage(
    {
      organizationId,
    },
    {
      cursor,
      limit,
    },
  );

  return NextResponse.json(tracePage);
});

export const POST = withApiErrorHandling("trace_create_failed", async (request: Request) => {
  const body = (await request.json()) as {
    title?: string;
    source?: string;
    severity?: string;
  };

  const validation = validateTraceInput(body);

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 },
    );
  }

  const project = await prisma.project.findFirst({
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const trace = await prisma.traceEvent.create({
    data: {
      projectId: project.id,
      title: validation.data.title,
      source: validation.data.source,
      severity: validation.data.severity,
      status: "triaged",
      spanCount: 1,
      opportunityScore: traceOpportunityFromSeverity(validation.data.severity),
    },
  });

  return NextResponse.json({ trace }, { status: 201 });
});
