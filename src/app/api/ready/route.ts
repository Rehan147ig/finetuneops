import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api-handler";
import { getReadinessSnapshot } from "@/lib/system-status";

export const GET = withApiErrorHandling("ready_route_failed", async () => {
  const snapshot = await getReadinessSnapshot();

  return NextResponse.json(snapshot, {
    status: snapshot.ready ? 200 : 503,
  });
});
