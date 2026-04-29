import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageWorkspace } from "@/lib/authz";
import { logAuditEvent } from "@/lib/audit";
import { withApiErrorHandling } from "@/lib/api-handler";
import { invalidatePattern } from "@/lib/cache";
import { getPromptTemplate } from "@/lib/prompt-data";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const GET = withApiErrorHandling("prompt_detail_failed", async (_request, rawContext) => {
  const context = rawContext as RouteContext | undefined;
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { id } = (await context?.params) as Awaited<RouteContext["params"]>;
  const template = await getPromptTemplate(session.user.organizationId, id);

  if (!template) {
    return NextResponse.json({ error: "Prompt template not found." }, { status: 404 });
  }

  return NextResponse.json(template);
});

export const DELETE = withApiErrorHandling("prompt_delete_failed", async (_request, rawContext) => {
  const context = rawContext as RouteContext | undefined;
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!canManageWorkspace(session.user.role)) {
    return NextResponse.json(
      { error: "Only workspace owners or admins can delete prompts." },
      { status: 403 },
    );
  }

  const { id } = (await context?.params) as Awaited<RouteContext["params"]>;
  const template = await prisma.promptTemplate.findFirst({
    where: {
      id,
      organizationId: session.user.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Prompt template not found." }, { status: 404 });
  }

  await prisma.promptTemplate.update({
    where: {
      id: template.id,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  await invalidatePattern(`cache:prompts:${session.user.organizationId}:*`);

  await logAuditEvent({
    organizationId: session.user.organizationId,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? null,
    actorName: session.user.name ?? null,
    actorRole: session.user.role,
    action: "prompt_template_deleted",
    targetType: "prompt_template",
    targetId: template.id,
    targetName: template.name,
  });

  return NextResponse.json({ ok: true });
});
