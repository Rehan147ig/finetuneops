import { notFound } from "next/navigation";
import { PromptDetailClient } from "@/components/prompts/prompt-detail-client";
import { requireAuthSession } from "@/lib/auth-session";
import { getPromptTemplate } from "@/lib/prompt-data";

type PromptDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PromptDetailPage({ params }: PromptDetailPageProps) {
  const session = await requireAuthSession();
  const { id } = await params;
  const template = await getPromptTemplate(session.user.organizationId, id);

  if (!template) {
    notFound();
  }

  return (
    <PromptDetailClient
      template={{
        id: template.id,
        name: template.name,
        description: template.description,
        currentVersionId: template.currentVersionId,
        currentVersion: template.currentVersion
          ? {
              id: template.currentVersion.id,
              version: template.currentVersion.version,
              content: template.currentVersion.content,
              variables: template.currentVersion.variables,
              commitMessage: template.currentVersion.commitMessage,
              authorId: template.currentVersion.authorId,
              createdAt: template.currentVersion.createdAt.toISOString(),
              evalScore: template.currentVersion.evalScore,
              latencyMs: template.currentVersion.latencyMs,
              deployedAt: template.currentVersion.deployedAt?.toISOString() ?? null,
              deployedBy: template.currentVersion.deployedBy ?? null,
              environment: template.currentVersion.environment ?? null,
            }
          : null,
        versions: template.versions.map((version) => ({
          id: version.id,
          version: version.version,
          content: version.content,
          variables: version.variables,
          commitMessage: version.commitMessage,
          authorId: version.authorId,
          createdAt: version.createdAt.toISOString(),
          evalScore: version.evalScore,
          latencyMs: version.latencyMs,
          deployedAt: version.deployedAt?.toISOString() ?? null,
          deployedBy: version.deployedBy ?? null,
          environment: version.environment ?? null,
        })),
      }}
    />
  );
}
