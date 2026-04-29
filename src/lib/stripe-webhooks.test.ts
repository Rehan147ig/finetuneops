import { beforeEach, describe, expect, it, vi } from "vitest";

type TestOrganization = {
  id: string;
  name: string;
  slug: string;
  billingPlan: string;
  billingInterval: string;
  billingEmail: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  stripeSubscriptionStatus: string;
  stripeCurrentPeriodStart: Date | null;
  stripeCurrentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  users: Array<{ id: string; email: string; createdAt: Date }>;
  projects: Array<{ id: string; organizationId: string; createdAt: Date }>;
  usageRecords: Array<{
    id: string;
    organizationId: string;
    planId: string;
    periodStart: Date;
    periodEnd: Date;
    tracesUsed: number;
    fineTuneJobsUsed: number;
    overageTraces: number;
    warningSentAt: Date | null;
  }>;
};

const {
  state,
  mockPrisma,
  recordActivityEvent,
  resendSend,
} = vi.hoisted(() => {
  const state = {
    organizations: [] as TestOrganization[],
    processedEvents: new Map<string, { id: string; type: string }>(),
    billingUsageCreates: [] as Array<Record<string, unknown>>,
    activityEvents: [] as Array<Record<string, unknown>>,
    experimentCount: 2,
  };

  const mockPrisma = {
    processedWebhookEvent: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        return state.processedEvents.get(where.id) ?? null;
      }),
      create: vi.fn(({ data }: { data: { id: string; type: string } }) => {
        state.processedEvents.set(data.id, data);
        return data;
      }),
    },
    organization: {
      findFirst: vi.fn(({ where }: { where: { stripeCustomerId?: string } }) => {
        const organization = state.organizations.find(
          (item) => item.stripeCustomerId === where.stripeCustomerId,
        );

        return organization ? structuredClone(organization) : null;
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const organization = state.organizations.find((item) => item.id === where.id);

        if (!organization) {
          throw new Error("Organization not found");
        }

        Object.assign(organization, data);
        return structuredClone(organization);
      }),
    },
    project: {
      findFirst: vi.fn(({ where }: { where: { organizationId: string } }) => {
        const organization = state.organizations.find((item) => item.id === where.organizationId);
        return organization?.projects[0] ?? null;
      }),
    },
    experimentRun: {
      count: vi.fn(() => state.experimentCount),
    },
    billingUsage: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const organization = state.organizations.find(
          (item) => item.id === data.organizationId,
        );

        if (!organization) {
          throw new Error("Organization not found");
        }

        const record = {
          id: `usage_${organization.usageRecords.length + 1}`,
          warningSentAt: null,
          ...data,
        };
        organization.usageRecords.push(record as TestOrganization["usageRecords"][number]);
        state.billingUsageCreates.push(record);

        return structuredClone(record);
      }),
    },
  };

  const recordActivityEvent = vi.fn((payload: Record<string, unknown>) => {
    state.activityEvents.push(payload);
    return payload;
  });

  const resendSend = vi.fn(async () => ({ id: "email_1" }));

  return {
    state,
    mockPrisma,
    recordActivityEvent,
    resendSend,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/workspace-data", () => ({
  recordActivityEvent,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: resendSend,
    };
  },
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/finetuneops?schema=public",
    NEXTAUTH_SECRET: "secret",
    NEXTAUTH_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "google",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GITHUB_CLIENT_ID: "github",
    GITHUB_CLIENT_SECRET: "github-secret",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_PUBLISHABLE_KEY: "pk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "FineTuneOps <test@example.com>",
    REDIS_URL: "redis://localhost:6379",
    ENCRYPTION_KEY: "12345678901234567890123456789012",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    APP_URL: "http://localhost:3000",
  }),
}));

import { handleStripeWebhookEvent } from "@/lib/stripe-webhooks";

describe("handleStripeWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.organizations = [
      {
        id: "org_1",
        name: "Can of Soup",
        slug: "can-of-soup",
        billingPlan: "starter",
        billingInterval: "monthly",
        billingEmail: "owner@example.com",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_starter",
        stripeSubscriptionStatus: "trialing",
        stripeCurrentPeriodStart: new Date("2026-04-01T00:00:00.000Z"),
        stripeCurrentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
        trialEndsAt: new Date("2026-05-01T00:00:00.000Z"),
        users: [
          {
            id: "user_1",
            email: "owner@example.com",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
        projects: [
          {
            id: "project_1",
            organizationId: "org_1",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
        usageRecords: [
          {
            id: "usage_existing",
            organizationId: "org_1",
            planId: "starter",
            periodStart: new Date("2026-04-01T00:00:00.000Z"),
            periodEnd: new Date("2026-05-01T00:00:00.000Z"),
            tracesUsed: 420,
            fineTuneJobsUsed: 1,
            overageTraces: 0,
            warningSentAt: null,
          },
        ],
      },
    ];
    state.processedEvents.clear();
    state.billingUsageCreates = [];
    state.activityEvents = [];
    state.experimentCount = 2;
  });

  it("processes a webhook only once even if Stripe retries the same event id", async () => {
    const event = {
      id: "evt_duplicate",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          trial_end: null,
          metadata: {
            requestedPlan: "pro",
          },
          items: {
            data: [
              {
                price: {
                  id: "price_pro",
                  recurring: {
                    interval: "monthly",
                  },
                },
                current_period_start: 1_776_988_800,
                current_period_end: 1_779_667_200,
              },
            ],
          },
        },
      },
    } as never;

    const first = await handleStripeWebhookEvent(event);
    const snapshotAfterFirst = JSON.stringify(state.organizations[0]);
    const duplicateResults = await Promise.all([
      handleStripeWebhookEvent(event),
      handleStripeWebhookEvent(event),
      handleStripeWebhookEvent(event),
      handleStripeWebhookEvent(event),
      handleStripeWebhookEvent(event),
    ]);

    expect(first).toEqual({
      processed: true,
      duplicate: false,
    });
    expect(duplicateResults).toEqual(
      Array.from({ length: 5 }, () => ({
        processed: false,
        duplicate: true,
      })),
    );
    expect(JSON.stringify(state.organizations[0])).toBe(snapshotAfterFirst);
    expect(state.processedEvents.size).toBe(1);
  });

  it("resets billing usage to zero on subscription cycle renewal", async () => {
    await handleStripeWebhookEvent({
      id: "evt_invoice_paid",
      type: "invoice.paid",
      data: {
        object: {
          customer: "cus_123",
          billing_reason: "subscription_cycle",
          lines: {
            data: [
              {
                price: {
                  id: "price_starter",
                },
                period: {
                  start: 1_777_161_600,
                  end: 1_779_840_000,
                },
              },
            ],
          },
        },
      },
    } as never);

    const latestUsage = state.organizations[0].usageRecords.at(-1);

    expect(latestUsage?.tracesUsed).toBe(0);
    expect(latestUsage?.fineTuneJobsUsed).toBe(0);
    expect(latestUsage?.planId).toBe("starter");
    expect(latestUsage?.periodEnd.toISOString()).toBe("2026-05-27T00:00:00.000Z");
  });

  it("transitions a trial workspace to active on the first paid invoice", async () => {
    await handleStripeWebhookEvent({
      id: "evt_trial_conversion",
      type: "invoice.paid",
      data: {
        object: {
          customer: "cus_123",
          billing_reason: "subscription_create",
          lines: {
            data: [
              {
                price: {
                  id: "price_starter",
                },
                period: {
                  start: 1_777_161_600,
                  end: 1_779_840_000,
                },
              },
            ],
          },
        },
      },
    } as never);

    expect(state.organizations[0].stripeSubscriptionStatus).toBe("active");
    expect(state.organizations[0].trialEndsAt).toBeNull();
    expect(state.organizations[0].billingPlan).toBe("starter");
  });

  it("sends a warning email and logs activity when a trial is ending soon", async () => {
    await handleStripeWebhookEvent({
      id: "evt_trial_warning",
      type: "customer.subscription.trial_will_end",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          trial_end: 1_779_580_800,
          metadata: {},
          items: {
            data: [
              {
                price: {
                  id: "price_starter",
                  recurring: {
                    interval: "monthly",
                  },
                },
              },
            ],
          },
        },
      },
    } as never);

    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "trial_ending_soon",
      }),
    );
  });

  it("moves the workspace back to free when a subscription is deleted", async () => {
    await handleStripeWebhookEvent({
      id: "evt_subscription_deleted",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "canceled",
          trial_end: null,
          metadata: {},
          items: {
            data: [
              {
                price: {
                  id: "price_starter",
                  recurring: {
                    interval: "monthly",
                  },
                },
              },
            ],
          },
        },
      },
    } as never);

    expect(state.organizations[0].billingPlan).toBe("free");
    expect(state.organizations[0].stripeSubscriptionId).toBeNull();
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "subscription_cancelled",
      }),
    );
  });
});
