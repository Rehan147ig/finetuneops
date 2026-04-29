import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authenticateWorkspaceApiKey } from "@/lib/api-keys";
import { withApiErrorHandling } from "@/lib/api-handler";
import { searchDocs, searchWorkspace } from "@/lib/search-data";

export const GET = withApiErrorHandling("search_route_failed", async (request) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const scope = searchParams.get("scope") === "workspace" ? "workspace" : "docs";

  if (!query) {
    return NextResponse.json({
      results: [],
    });
  }

  if (scope === "docs") {
    const results = await searchDocs(query);
    return NextResponse.json({ results });
  }

  const session = await auth();
  const apiKey =
    request.headers.get("x-api-key") ?? request.headers.get("x-finetuneops-key");
  const apiKeyScope = apiKey ? await authenticateWorkspaceApiKey(apiKey) : null;
  const organizationId = session?.user?.organizationId ?? apiKeyScope?.organizationId ?? null;

  if (!organizationId) {
    return NextResponse.json(
      { error: "Authentication required for workspace search." },
      { status: 401 },
    );
  }

  const results = await searchWorkspace(organizationId, query);
  return NextResponse.json({ results });
});
