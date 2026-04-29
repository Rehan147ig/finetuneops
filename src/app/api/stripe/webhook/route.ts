import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { initializeSentry, Sentry } from "@/lib/sentry";
import { getStripe } from "@/lib/stripe";
import { handleStripeWebhookEvent } from "@/lib/stripe-webhooks";

const env = getServerEnv();

export async function POST(request: Request) {
  initializeSentry();
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    logger.warn({
      event: "stripe_webhook_invalid_signature",
      reason: "missing_signature",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    await handleStripeWebhookEvent(event);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logger.warn({
      event: "stripe_webhook_invalid_signature",
      reason: "verification_failed",
    });
    Sentry.captureException(error, {
      tags: {
        event: "stripe_webhook_invalid_signature",
      },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
}
