import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { getWorkspaceData } from "@/lib/workspace-data";

export const GET = withApiErrorHandling("workspace_route_failed", async () => {
  const session = await auth();

  if (!session?.user?.organizationId) {
    return NextResponse.json(
      {
        error: "You must be signed in to view workspace data.",
      },
      { status: 401 },
    );
  }

  const data = await getWorkspaceData({
    organizationId: session.user.organizationId,
  });

  return NextResponse.json(data);
});
