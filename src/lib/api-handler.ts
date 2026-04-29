import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { initializeSentry, Sentry } from "@/lib/sentry";

type ApiHandler = (request: Request, context?: unknown) => Promise<Response>;

export function withApiErrorHandling(event: string, handler: ApiHandler): ApiHandler {
  return async (request: Request, context?: unknown) => {
    initializeSentry();

    try {
      return await handler(request, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected API failure";
      logger.error({
        event,
        route: request.url,
        method: request.method,
        error: message,
      });
      Sentry.captureException(error, {
        tags: {
          event,
          method: request.method,
        },
      });

      return NextResponse.json(
        { error: "Something went wrong while processing this request." },
        { status: 500 },
      );
    }
  };
}
