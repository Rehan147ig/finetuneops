import type Stripe from "stripe";
import { Resend } from "resend";
import {
  getPlanIdFromPriceId,
  isBillingInterval,
  isBillingPlanId,
  type BillingPlanId,
} from "@/lib/billing";
import { CacheKeys, invalidate } from "@/lib/cache";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { recordActivityEvent } from "@/lib/workspace-data";

const env = getServerEnv();

function toDateFromUnix(value?: number | null) {
  return value ? new Date(value * 1000) : null;
}

function getSubscriptionLine(subscription: Stripe.Subscription) {
  return subscription.items.data[0];
}

function getInvoiceLine(invoice: Stripe.Invoice) {
  return invoice.lines.data[0];
}

function getInvoiceLinePriceId(invoice: Stripe.Invoice) {
  const line = getInvoiceLine(invoice) as Stripe.InvoiceLineItem & {
    price?: {
      id?: string;
    };
  };

  return line.price?.id ?? null;
}

function getInvoiceLinePeriod(invoice: Stripe.Invoice) {
  const line = getInvoiceLine(invoice) as Stripe.InvoiceLineItem & {
    period?: {
      start?: number;
      end?: number;
    };
  };

  return line.period;
}

function resolvePlanIdFromSubscription(
  subscription: Stripe.Subscription,
  fallbackPlanId: string,
): BillingPlanId {
  const requestedPlan = subscription.metadata.requestedPlan;

  if (requestedPlan && isBillingPlanId(requestedPlan)) {
    return requestedPlan;
  }

  return (
    getPlanIdFromPriceId(getSubscriptionLine(subscription)?.price.id) ??
    (isBillingPlanId(fallbackPlanId) ? fallbackPlanId : "free")
  );
}

function resolvePlanIdFromInvoice(invoice: Stripe.Invoice, fallbackPlanId: string): BillingPlanId {
  return (
    getPlanIdFromPriceId(getInvoiceLinePriceId(invoice)) ??
    (isBillingPlanId(fallbackPlanId) ? fallbackPlanId : "free")
  );
}

function resolveInterval(subscription: Stripe.Subscription) {
  const interval = getSubscriptionLine(subscription)?.price.recurring?.interval;
  return interval && isBillingInterval(interval) ? interval : "monthly";
}

async function findOrganizationByCustomerId(customerId?: string | null) {
  if (!customerId) {
    return null;
  }

  return prisma.organization.findFirst({
    where: {
      stripeCustomerId: customerId,
    },
    include: {
      users: {
        orderBy: {
          createdAt: "asc",
        },
      },
      projects: {
        orderBy: {
          createdAt: "asc",
        },
        take: 1,
      },
      usageRecords: {
        orderBy: {
          periodEnd: "desc",
        },
        take: 5,
      },
    },
  });
}

async function sendBillingEmail(input: {
  to?: string | null;
  subject: string;
  html: string;
}) {
  if (!input.to) {
    return {
      sent: false,
    };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: [input.to],
    subject: input.subject,
    html: input.html,
  });

  return {
    sent: true,
  };
}

async function recordOrganizationActivity(input: {
  organizationId: string;
  type: "trial_ending_soon" | "subscription_cancelled";
  message: string;
  userId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const project = await prisma.project.findFirst({
    where: {
      organizationId: input.organizationId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!project) {
    return;
  }

  await recordActivityEvent({
    projectId: project.id,
    type: input.type,
    message: input.message,
    userId: input.userId ?? "system",
    metadata: input.metadata,
  });
}

async function createFreshBillingWindow(input: {
  organizationId: string;
  planId: BillingPlanId;
  periodEnd: Date;
}) {
  const periodStart = new Date();

  return prisma.billingUsage.create({
    data: {
      organizationId: input.organizationId,
      planId: input.planId,
      periodStart,
      periodEnd: input.periodEnd,
      tracesUsed: 0,
      fineTuneJobsUsed: 0,
      overageTraces: 0,
    },
  });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const organizationId = session.client_reference_id;

  if (!organizationId) {
    return;
  }

  await prisma.organization.update({
    where: {
      id: organizationId,
    },
    data: {
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    },
  });
}

async function syncSubscriptionState(subscription: Stripe.Subscription, eventType: Stripe.Event["type"]) {
  const organization = await findOrganizationByCustomerId(
    typeof subscription.customer === "string" ? subscription.customer : null,
  );

  if (!organization) {
    return;
  }

  const nextPlanId = resolvePlanIdFromSubscription(subscription, organization.billingPlan);
  const line = getSubscriptionLine(subscription);

  await prisma.organization.update({
    where: {
      id: organization.id,
    },
    data: {
      billingPlan: nextPlanId,
      billingInterval: resolveInterval(subscription),
      stripeSubscriptionId:
        eventType === "customer.subscription.deleted" ? null : subscription.id,
      stripePriceId:
        eventType === "customer.subscription.deleted" ? null : line?.price.id ?? null,
      stripeSubscriptionStatus:
        eventType === "customer.subscription.deleted" ? "inactive" : subscription.status,
      stripeCurrentPeriodStart:
        eventType === "customer.subscription.deleted"
          ? null
          : toDateFromUnix(line?.current_period_start ?? null),
      stripeCurrentPeriodEnd:
        eventType === "customer.subscription.deleted"
          ? null
          : toDateFromUnix(line?.current_period_end ?? null),
      trialEndsAt: subscription.trial_end ? toDateFromUnix(subscription.trial_end) : null,
    },
  });

  await invalidate(CacheKeys.workspacePlan(organization.id));
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const organization = await findOrganizationByCustomerId(
    typeof subscription.customer === "string" ? subscription.customer : null,
  );

  if (!organization) {
    return;
  }

  const tracesCaptured = organization.usageRecords.reduce((sum, usage) => sum + usage.tracesUsed, 0);
  const experimentsRun = await prisma.experimentRun.count({
    where: {
      project: {
        organizationId: organization.id,
      },
    },
  });

  await sendBillingEmail({
    to: organization.billingEmail ?? organization.users[0]?.email,
    subject: "Your FinetuneOps trial ends in 3 days",
    html: `
      <p>Your FinetuneOps trial ends in 3 days.</p>
      <p>So far your team captured ${tracesCaptured.toLocaleString("en-US")} traces and ran ${experimentsRun.toLocaleString("en-US")} experiments.</p>
      <p>Upgrade to keep ingesting traces, launching fine-tunes, and sharing release reviews without interruption.</p>
      <p><a href="${env.APP_URL}/settings">Open billing and upgrade</a></p>
    `,
  });

  await recordOrganizationActivity({
    organizationId: organization.id,
    type: "trial_ending_soon",
    message: `${organization.name}'s trial ends in 3 days.`,
    userId: organization.users[0]?.id ?? "system",
    metadata: {
      subscriptionId: subscription.id,
      trialEndsAt: subscription.trial_end ? toDateFromUnix(subscription.trial_end)?.toISOString() ?? null : null,
    },
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const organization = await findOrganizationByCustomerId(
    typeof subscription.customer === "string" ? subscription.customer : null,
  );

  if (!organization) {
    return;
  }

  await prisma.organization.update({
    where: {
      id: organization.id,
    },
    data: {
      billingPlan: "free",
      billingInterval: "monthly",
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeSubscriptionStatus: "inactive",
      stripeCurrentPeriodStart: null,
      stripeCurrentPeriodEnd: null,
      trialEndsAt: null,
    },
  });

  await invalidate(CacheKeys.workspacePlan(organization.id));

  await sendBillingEmail({
    to: organization.billingEmail ?? organization.users[0]?.email,
    subject: "Your FinetuneOps trial has ended",
    html: `
      <p>Your FinetuneOps paid access has ended and the workspace is now on the Free plan.</p>
      <p>You will keep your existing data, but new traces above the free tier limit and all fine-tune launches are blocked until you upgrade again.</p>
      <p><a href="${env.APP_URL}/settings">Open billing to upgrade</a></p>
    `,
  });

  await recordOrganizationActivity({
    organizationId: organization.id,
    type: "subscription_cancelled",
    message: `${organization.name} moved back to the Free plan after cancellation or trial expiry.`,
    userId: organization.users[0]?.id ?? "system",
    metadata: {
      subscriptionId: subscription.id,
    },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const organization = await findOrganizationByCustomerId(
    typeof invoice.customer === "string" ? invoice.customer : null,
  );

  if (!organization) {
    return;
  }

  const planId = resolvePlanIdFromInvoice(invoice, organization.billingPlan);
  const period = getInvoiceLinePeriod(invoice);
  const periodEnd =
    toDateFromUnix(period?.end ?? null) ??
    organization.stripeCurrentPeriodEnd ??
    new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await prisma.organization.update({
    where: {
      id: organization.id,
    },
    data: {
      billingPlan: planId,
      stripePriceId: getInvoiceLinePriceId(invoice) ?? organization.stripePriceId,
      stripeSubscriptionStatus: "active",
      trialEndsAt: null,
      stripeCurrentPeriodStart: toDateFromUnix(period?.start ?? null) ?? new Date(),
      stripeCurrentPeriodEnd: periodEnd,
    },
  });

  await invalidate(CacheKeys.workspacePlan(organization.id));

  if (invoice.billing_reason === "subscription_cycle") {
    await createFreshBillingWindow({
      organizationId: organization.id,
      planId,
      periodEnd,
    });
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const organization = await findOrganizationByCustomerId(
    typeof invoice.customer === "string" ? invoice.customer : null,
  );

  if (!organization) {
    return;
  }

  await prisma.organization.update({
    where: {
      id: organization.id,
    },
    data: {
      stripeSubscriptionStatus: "past_due",
    },
  });

  await invalidate(CacheKeys.workspacePlan(organization.id));
}

export async function handleStripeWebhookEvent(event: Stripe.Event) {
  const existing = await prisma.processedWebhookEvent.findUnique({
    where: {
      id: event.id,
    },
  });

  if (existing) {
    return {
      processed: false,
      duplicate: true,
    };
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscriptionState(event.data.object as Stripe.Subscription, event.type);
      break;
    case "customer.subscription.deleted":
      await syncSubscriptionState(event.data.object as Stripe.Subscription, event.type);
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.trial_will_end":
      await handleTrialWillEnd(event.data.object as Stripe.Subscription);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    default:
      break;
  }

  await prisma.processedWebhookEvent.create({
    data: {
      id: event.id,
      type: event.type,
    },
  });

  return {
    processed: true,
    duplicate: false,
  };
}
