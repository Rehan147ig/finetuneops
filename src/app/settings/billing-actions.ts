"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspaceManager } from "@/lib/auth-session";
import { errorResult, type ActionResult } from "@/lib/action-state";
import { getPlanPriceId, isBillingInterval, isBillingPlanId } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

const checkoutSchema = z.object({
  planId: z.string(),
  interval: z.string(),
});

export async function createCheckoutSessionAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireWorkspaceManager();
  const parsed = checkoutSchema.safeParse({
    planId: formData.get("planId"),
    interval: formData.get("interval"),
  });

  if (!parsed.success || !isBillingPlanId(parsed.data.planId) || !isBillingInterval(parsed.data.interval)) {
    return errorResult("Choose a valid billing plan and interval.");
  }

  if (parsed.data.planId === "free") {
    return errorResult("The Free plan does not use Stripe checkout.");
  }

  const stripe = getStripe();

  if (!stripe) {
    return errorResult("Stripe is not configured yet.");
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: {
      id: session.user.organizationId,
    },
  });

  const priceId = getPlanPriceId(parsed.data.planId, parsed.data.interval);

  if (!priceId) {
    return errorResult("This Stripe price is not configured yet.");
  }

  let customerId = organization.stripeCustomerId ?? undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: organization.name,
      email: organization.billingEmail ?? session.user.email ?? undefined,
      metadata: {
        organizationId: organization.id,
        workspaceSlug: organization.slug,
      },
    });

    customerId = customer.id;

    await prisma.organization.update({
      where: {
        id: organization.id,
      },
      data: {
        stripeCustomerId: customer.id,
        billingEmail: organization.billingEmail ?? session.user.email ?? undefined,
      },
    });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: organization.id,
    success_url: `${process.env.APP_URL ?? "http://localhost:3000"}/settings?billing=success`,
    cancel_url: `${process.env.APP_URL ?? "http://localhost:3000"}/settings?billing=cancelled`,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    payment_method_collection:
      parsed.data.planId === "starter" || parsed.data.planId === "pro" ? "if_required" : "always",
    subscription_data:
      parsed.data.planId === "starter" || parsed.data.planId === "pro"
        ? {
            trial_period_days: 14,
            trial_settings: {
              end_behavior: {
                missing_payment_method: "cancel",
              },
            },
            metadata: {
              organizationId: organization.id,
              requestedPlan: parsed.data.planId,
              requestedInterval: parsed.data.interval,
            },
          }
        : {
            metadata: {
              organizationId: organization.id,
              requestedPlan: parsed.data.planId,
              requestedInterval: parsed.data.interval,
            },
          },
  });

  if (!checkoutSession.url) {
    return errorResult("Stripe checkout did not return a redirect URL.");
  }

  redirect(checkoutSession.url);
}

export async function createBillingPortalAction(
  _previousState?: ActionResult,
  _formData?: FormData,
) {
  const session = await requireWorkspaceManager();
  const stripe = getStripe();

  if (!stripe) {
    return errorResult("Stripe is not configured yet.");
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: {
      id: session.user.organizationId,
    },
  });

  if (!organization.stripeCustomerId) {
    return errorResult("This workspace does not have a Stripe customer yet.");
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    return_url: `${process.env.APP_URL ?? "http://localhost:3000"}/settings`,
  });

  redirect(portalSession.url);
}
