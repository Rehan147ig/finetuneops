import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { getPlanPriceId, isBillingInterval, isBillingPlanId } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";

export const POST = withApiErrorHandling("billing_checkout_failed", async (request: Request) => {
  const session = await auth();

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "You must be signed in to upgrade a workspace." }, { status: 401 });
  }

  const rl = await checkRateLimit(session.user.organizationId, "api");

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "API rate limit exceeded", retryAfter: 60 },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const body = (await request.json()) as {
    planId?: string;
    interval?: string;
  };

  if (!body.planId || !isBillingPlanId(body.planId) || body.planId === "free") {
    return NextResponse.json({ error: "Choose a paid billing plan." }, { status: 400 });
  }

  if (!body.interval || !isBillingInterval(body.interval)) {
    return NextResponse.json({ error: "Choose a valid billing interval." }, { status: 400 });
  }

  const stripe = getStripe();

  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured yet." }, { status: 503 });
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: {
      id: session.user.organizationId,
    },
  });

  const priceId = getPlanPriceId(body.planId, body.interval);

  if (!priceId) {
    return NextResponse.json({ error: "This Stripe price is not configured yet." }, { status: 503 });
  }

  let customerId = organization.stripeCustomerId ?? undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: organization.name,
      email: organization.billingEmail ?? session.user.email ?? undefined,
      metadata: {
        organizationId: organization.id,
      },
    });
    customerId = customer.id;
    await prisma.organization.update({
      where: { id: organization.id },
      data: { stripeCustomerId: customer.id, billingEmail: organization.billingEmail ?? session.user.email ?? undefined },
    });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: organization.id,
    success_url: `${process.env.APP_URL ?? "http://localhost:3000"}/settings?billing=success`,
    cancel_url: `${process.env.APP_URL ?? "http://localhost:3000"}/settings?billing=cancelled`,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_collection: body.planId === "starter" || body.planId === "pro" ? "if_required" : "always",
    subscription_data:
      body.planId === "starter" || body.planId === "pro"
        ? {
            trial_period_days: 14,
            trial_settings: {
              end_behavior: {
                missing_payment_method: "cancel",
              },
            },
          }
        : undefined,
  });

  return NextResponse.json({ url: checkoutSession.url }, { status: 200, headers: rateLimitHeaders(rl) });
});
