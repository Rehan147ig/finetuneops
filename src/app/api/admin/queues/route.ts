import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { getQueueStats } from "@/lib/queue-monitor";

export const GET = withApiErrorHandling("admin_queues_failed", async () => {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const queues = await getQueueStats();

  return NextResponse.json(
    {
      queues,
      anyWarning: queues.some((queue) => queue.level === "warning" || queue.level === "critical"),
      anyCritical: queues.some((queue) => queue.level === "critical"),
      checkedAt: new Date().toISOString(),
    },
    { status: 200 },
  );
});
