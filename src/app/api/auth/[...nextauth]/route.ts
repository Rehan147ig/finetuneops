import { handlers } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";

export const GET = withApiErrorHandling("auth_route_get_failed", handlers.GET as never);
export const POST = withApiErrorHandling("auth_route_post_failed", handlers.POST as never);
