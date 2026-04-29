import { prisma } from "@/lib/prisma";
import { getServerEnv } from "@/lib/env";
import { cached, CacheKeys, CacheTTL, invalidate } from "@/lib/cache";
import {
  canLaunchFineTune,
  getBillingPeriodWindow,
  getBillingPlan,
  getTraceUsageDecision,
  shouldSendUsageWarning,
} from "@/lib/billing";
import { Resend } from "resend";

const env = getServerEnv();

export async function getOrCreateBillingUsage(organizationId: string) {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: {
      id: organizationId,
    },
    include: {
      users: {
        orderBy: {
          createdAt: "asc",
        },
        take: 1,
      },
    },
  });

  const { periodStart, periodEnd } = getBillingPeriodWindow(organization);

  const usage = await prisma.billingUsage.upsert({
    where: {
      organizationId_periodStart_periodEnd: {
        organizationId,
        periodStart,
        periodEnd,
      },
    },
    update: {},
    create: {
      organizationId,
      planId: organization.billingPlan,
      periodStart,
      periodEnd,
    },
  });

  return {
    organization,
    usage,
  };
}

export async function getWorkspaceUsage(organizationId: string) {
  return cached(
    CacheKeys.workspaceUsage(organizationId),
    CacheTTL.workspaceUsage,
    async () => {
      const organization = await prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
      });

      if (!organization) {
        return null;
      }

      const { periodStart, periodEnd } = getBillingPeriodWindow(organization);

      return prisma.billingUsage.findFirst({
        where: {
          organizationId,
          periodStart,
          periodEnd,
        },
      });
    },
  );
}

export async function enforceTraceLimit(organizationId: string) {
  const { organization, usage } = await getOrCreateBillingUsage(organizationId);

  return getTraceUsageDecision(organization.billingPlan, usage);
}

export async function incrementTraceUsage(organizationId: string) {
  const { organization, usage } = await getOrCreateBillingUsage(organizationId);
  const plan = getBillingPlan(organization.billingPlan);
  const updated = await prisma.billingUsage.update({
    where: {
      id: usage.id,
    },
    data: {
      planId: organization.billingPlan,
      tracesUsed: {
        increment: 1,
      },
      overageTraces:
        plan.allowOverage && usage.tracesUsed + 1 > plan.includedTraces
          ? {
              increment: 1,
            }
          : undefined,
    },
  });

  if (shouldSendUsageWarning(updated, organization.billingPlan)) {
    await sendUsageWarningEmail({
      email: organization.billingEmail ?? organization.users[0]?.email,
      organizationName: organization.name,
      planName: plan.name,
      tracesUsed: updated.tracesUsed,
      includedTraces: plan.includedTraces,
    });

    await prisma.billingUsage.update({
      where: {
        id: updated.id,
      },
      data: {
        warningSentAt: new Date(),
      },
    });
  }

  await invalidate(CacheKeys.workspaceUsage(organizationId));

  return updated;
}

export async function enforceFineTuneLimit(organizationId: string) {
  const { organization, usage } = await getOrCreateBillingUsage(organizationId);

  return canLaunchFineTune(organization.billingPlan, usage);
}

export async function incrementFineTuneUsage(organizationId: string) {
  const { organization, usage } = await getOrCreateBillingUsage(organizationId);
  const updated = await prisma.billingUsage.update({
    where: {
      id: usage.id,
    },
    data: {
      planId: organization.billingPlan,
      fineTuneJobsUsed: {
        increment: 1,
      },
    },
  });

  await invalidate(CacheKeys.workspaceUsage(organizationId));

  return updated;
}

export async function sendUsageWarningEmail(input: {
  email?: string;
  organizationName: string;
  planName: string;
  tracesUsed: number;
  includedTraces: number;
}) {
  if (!input.email) {
    return {
      sent: false,
    };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: [input.email],
    subject: `${input.organizationName} is nearing its trace limit`,
    html: `
      <p>${input.organizationName} has used ${input.tracesUsed.toLocaleString("en-US")} of ${input.includedTraces.toLocaleString("en-US")} traces on the ${input.planName} plan.</p>
      <p>Upgrade or monitor overages to keep ingestion flowing smoothly.</p>
    `,
  });

  return {
    sent: true,
  };
}
