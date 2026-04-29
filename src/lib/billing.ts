import type { Organization } from "@prisma/client";

export type BillingPlanId = "free" | "starter" | "pro" | "team";
export type BillingInterval = "monthly" | "annual";

export type BillingPlan = {
  id: BillingPlanId;
  name: string;
  monthlyPrice: number;
  includedTraces: number;
  includedWorkspaces: number | "unlimited";
  includedTeamMembers: number | "unlimited";
  includedFineTuneJobs: number | "unlimited";
  trialDays: number;
  support: string;
  advancedAnalytics: boolean;
  auditLogs: boolean;
  overageRatePerTrace: number;
  allowOverage: boolean;
};

export const billingPlans: Record<BillingPlanId, BillingPlan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    includedTraces: 100,
    includedWorkspaces: 1,
    includedTeamMembers: 1,
    includedFineTuneJobs: 0,
    trialDays: 0,
    support: "Community support",
    advancedAnalytics: false,
    auditLogs: false,
    overageRatePerTrace: 0,
    allowOverage: false,
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 49,
    includedTraces: 5000,
    includedWorkspaces: 3,
    includedTeamMembers: 3,
    includedFineTuneJobs: 1,
    trialDays: 14,
    support: "Email support",
    advancedAnalytics: false,
    auditLogs: false,
    overageRatePerTrace: 0.001,
    allowOverage: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 149,
    includedTraces: 50000,
    includedWorkspaces: "unlimited",
    includedTeamMembers: 10,
    includedFineTuneJobs: "unlimited",
    trialDays: 14,
    support: "Priority support",
    advancedAnalytics: true,
    auditLogs: false,
    overageRatePerTrace: 0.001,
    allowOverage: true,
  },
  team: {
    id: "team",
    name: "Team",
    monthlyPrice: 399,
    includedTraces: 200000,
    includedWorkspaces: "unlimited",
    includedTeamMembers: "unlimited",
    includedFineTuneJobs: "unlimited",
    trialDays: 0,
    support: "Dedicated Slack support",
    advancedAnalytics: true,
    auditLogs: true,
    overageRatePerTrace: 0.001,
    allowOverage: true,
  },
};

export type BillingUsageSnapshot = {
  tracesUsed: number;
  fineTuneJobsUsed: number;
  overageTraces: number;
  periodStart: Date;
  periodEnd: Date;
  warningSentAt?: Date | null;
};

export type BillingGateDecision = {
  allowed: boolean;
  reason?: string;
  projectedOverageCharge: number;
  usagePercent: number;
  warningThresholdReached: boolean;
};

export type BillingUsageMeter = {
  tracesUsed: number;
  includedTraces: number;
  usagePercent: number;
  overageTraces: number;
  overageCharge: number;
  overLimit: boolean;
};

export type BillingDowngradeImpact = {
  overTeamMemberLimit: boolean;
  removableMemberCount: number;
  retainsExistingData: boolean;
  newTraceLimit: number;
  newFineTuneLimit: number | "unlimited";
};

export function getBillingPlan(planId: string): BillingPlan {
  if (planId in billingPlans) {
    return billingPlans[planId as BillingPlanId];
  }

  return billingPlans.free;
}

export function getAnnualPrice(monthlyPrice: number) {
  return monthlyPrice * 10;
}

export function calculateTraceOverageCharge(overageTraces: number, ratePerTrace = 0.001) {
  return Number((Math.max(overageTraces, 0) * ratePerTrace).toFixed(3));
}

export function getBillingPeriodWindow(organization: Pick<Organization, "stripeCurrentPeriodStart" | "stripeCurrentPeriodEnd">) {
  if (organization.stripeCurrentPeriodStart && organization.stripeCurrentPeriodEnd) {
    return {
      periodStart: organization.stripeCurrentPeriodStart,
      periodEnd: organization.stripeCurrentPeriodEnd,
    };
  }

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    periodStart,
    periodEnd,
  };
}

export function getTraceUsageDecision(planId: string, usage: BillingUsageSnapshot): BillingGateDecision {
  const plan = getBillingPlan(planId);
  const projectedTraces = usage.tracesUsed + 1;
  const overageTraces = Math.max(projectedTraces - plan.includedTraces, 0);
  const warningThresholdReached = projectedTraces >= Math.ceil(plan.includedTraces * 0.8);
  const usagePercent = Number(((projectedTraces / plan.includedTraces) * 100).toFixed(1));

  if (!plan.allowOverage && projectedTraces > plan.includedTraces) {
    return {
      allowed: false,
      reason: `Your ${plan.name} plan includes ${plan.includedTraces.toLocaleString("en-US")} traces per billing period. Upgrade to continue ingesting traces.`,
      projectedOverageCharge: 0,
      usagePercent,
      warningThresholdReached,
    };
  }

  return {
    allowed: true,
    projectedOverageCharge: calculateTraceOverageCharge(overageTraces, plan.overageRatePerTrace),
    usagePercent,
    warningThresholdReached,
  };
}

export function canLaunchFineTune(planId: string, usage: BillingUsageSnapshot) {
  const plan = getBillingPlan(planId);

  if (plan.includedFineTuneJobs === "unlimited") {
    return {
      allowed: true,
    };
  }

  if (usage.fineTuneJobsUsed >= plan.includedFineTuneJobs) {
    return {
      allowed: false,
      reason: `Your ${plan.name} plan includes ${plan.includedFineTuneJobs} fine-tune job${plan.includedFineTuneJobs === 1 ? "" : "s"} per billing period.`,
    };
  }

  return {
    allowed: true,
  };
}

export function shouldSendUsageWarning(usage: BillingUsageSnapshot, planId: string) {
  const plan = getBillingPlan(planId);
  const threshold = Math.ceil(plan.includedTraces * 0.8);

  return usage.tracesUsed >= threshold && !usage.warningSentAt;
}

export function getUsageMeter(planId: string, usage: BillingUsageSnapshot): BillingUsageMeter {
  const plan = getBillingPlan(planId);
  const usagePercent = Number(((usage.tracesUsed / plan.includedTraces) * 100).toFixed(1));
  const overageTraces = Math.max(usage.tracesUsed - plan.includedTraces, 0);

  return {
    tracesUsed: usage.tracesUsed,
    includedTraces: plan.includedTraces,
    usagePercent,
    overageTraces,
    overageCharge: calculateTraceOverageCharge(overageTraces, plan.overageRatePerTrace),
    overLimit: usage.tracesUsed > plan.includedTraces,
  };
}

export function canAddTeamMember(planId: string, currentMemberCount: number) {
  const plan = getBillingPlan(planId);

  if (plan.includedTeamMembers === "unlimited") {
    return {
      allowed: true,
    };
  }

  if (currentMemberCount >= plan.includedTeamMembers) {
    return {
      allowed: false,
      reason: `Your ${plan.name} plan includes ${plan.includedTeamMembers} team member${plan.includedTeamMembers === 1 ? "" : "s"}. Upgrade to invite more people.`,
    };
  }

  return {
    allowed: true,
  };
}

export function getPlanDowngradeImpact(
  currentPlanId: string,
  nextPlanId: string,
  currentMemberCount: number,
): BillingDowngradeImpact {
  const currentPlan = getBillingPlan(currentPlanId);
  const nextPlan = getBillingPlan(nextPlanId);
  const includedMembers =
    nextPlan.includedTeamMembers === "unlimited" ? Number.POSITIVE_INFINITY : nextPlan.includedTeamMembers;
  const removableMemberCount = Math.max(currentMemberCount - includedMembers, 0);

  return {
    overTeamMemberLimit:
      nextPlan.includedTeamMembers === "unlimited" ? false : currentMemberCount > nextPlan.includedTeamMembers,
    removableMemberCount,
    retainsExistingData: currentPlan.id !== nextPlan.id,
    newTraceLimit: nextPlan.includedTraces,
    newFineTuneLimit: nextPlan.includedFineTuneJobs,
  };
}

export function getPlanPriceId(planId: BillingPlanId, interval: BillingInterval) {
  const envMap: Record<BillingPlanId, Record<BillingInterval, string | undefined>> = {
    free: {
      monthly: undefined,
      annual: undefined,
    },
    starter: {
      monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
      annual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    },
    pro: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
    },
    team: {
      monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,
      annual: process.env.STRIPE_PRICE_TEAM_ANNUAL,
    },
  };

  return envMap[planId][interval];
}

export function getPlanIdFromPriceId(priceId?: string | null): BillingPlanId | null {
  if (!priceId) {
    return null;
  }

  const planIds = Object.keys(billingPlans) as BillingPlanId[];

  for (const planId of planIds) {
    if (planId === "free") {
      continue;
    }

    if (getPlanPriceId(planId, "monthly") === priceId || getPlanPriceId(planId, "annual") === priceId) {
      return planId;
    }
  }

  return null;
}

export function isBillingPlanId(value: string): value is BillingPlanId {
  return value in billingPlans;
}

export function isBillingInterval(value: string): value is BillingInterval {
  return value === "monthly" || value === "annual";
}
