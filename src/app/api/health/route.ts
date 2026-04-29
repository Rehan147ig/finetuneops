import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api-handler";
import { getHealthSnapshot } from "@/lib/system-status";

export const GET = withApiErrorHandling("health_route_failed", async () => {
  const snapshot = await getHealthSnapshot();

  return NextResponse.json(snapshot, {
    status: snapshot.status === "down" ? 503 : 200,
  });
});
