import { describe, expect, it } from "vitest";
import {
  calculateTraceOverageCharge,
  canAddTeamMember,
  canLaunchFineTune,
  getPlanDowngradeImpact,
  getAnnualPrice,
  getBillingPeriodWindow,
  getBillingPlan,
  getTraceUsageDecision,
  getUsageMeter,
  shouldSendUsageWarning,
} from "@/lib/billing";

describe("billing helpers", () => {
  it("returns the expected annual price with two months free", () => {
    expect(getAnnualPrice(49)).toBe(490);
    expect(getAnnualPrice(149)).toBe(1490);
  });

  it("blocks free plan traces once the included quota is exhausted", () => {
    const decision = getTraceUsageDecision("free", {
      tracesUsed: 100,
      fineTuneJobsUsed: 0,
      overageTraces: 0,
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      warningSentAt: null,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("100 traces");
  });

  it("allows paid plans to continue with an overage charge", () => {
    const decision = getTraceUsageDecision("starter", {
      tracesUsed: 5000,
      fineTuneJobsUsed: 0,
      overageTraces: 0,
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      warningSentAt: null,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.projectedOverageCharge).toBe(0.001);
  });

  it("blocks fine-tune launches when the plan quota is exhausted", () => {
    const decision = canLaunchFineTune("starter", {
      tracesUsed: 2500,
      fineTuneJobsUsed: 1,
      overageTraces: 0,
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      warningSentAt: null,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("1 fine-tune job");
  });

  it("signals an 80 percent usage warning only once per period", () => {
    expect(
      shouldSendUsageWarning(
        {
          tracesUsed: 4000,
          fineTuneJobsUsed: 0,
          overageTraces: 0,
          periodStart: new Date("2026-04-01T00:00:00.000Z"),
          periodEnd: new Date("2026-05-01T00:00:00.000Z"),
          warningSentAt: null,
        },
        "starter",
      ),
    ).toBe(true);

    expect(
      shouldSendUsageWarning(
        {
          tracesUsed: 4000,
          fineTuneJobsUsed: 0,
          overageTraces: 0,
          periodStart: new Date("2026-04-01T00:00:00.000Z"),
          periodEnd: new Date("2026-05-01T00:00:00.000Z"),
          warningSentAt: new Date("2026-04-10T00:00:00.000Z"),
        },
        "starter",
      ),
    ).toBe(false);
  });

  it("returns the current Stripe billing window when present", () => {
    const periodStart = new Date("2026-04-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-01T00:00:00.000Z");

    expect(
      getBillingPeriodWindow({
        stripeCurrentPeriodStart: periodStart,
        stripeCurrentPeriodEnd: periodEnd,
      }),
    ).toEqual({
      periodStart,
      periodEnd,
    });
  });

  it("falls back to a known plan when the plan id is missing or invalid", () => {
    expect(getBillingPlan("starter").includedTraces).toBe(5000);
    expect(getBillingPlan("unknown").id).toBe("free");
  });

  it("calculates overage charges with the configured rate", () => {
    expect(calculateTraceOverageCharge(1430)).toBe(1.43);
  });

  it("blocks the 101st trace on the free plan", () => {
    const decision = getTraceUsageDecision("free", {
      tracesUsed: 100,
      fineTuneJobsUsed: 0,
      overageTraces: 0,
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      warningSentAt: null,
    });

    expect(decision.allowed).toBe(false);
  });

  it("blocks all fine-tune launches on the free plan", () => {
    const decision = canLaunchFineTune("free", {
      tracesUsed: 12,
      fineTuneJobsUsed: 0,
      overageTraces: 0,
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      warningSentAt: null,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("0 fine-tune jobs");
  });

  it("blocks a second team member on the free plan", () => {
    const gate = canAddTeamMember("free", 1);

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("1 team member");
  });

  it("treats an expired trial like the free tier for trace limits", () => {
    const decision = getTraceUsageDecision("free", {
      tracesUsed: 100,
      fineTuneJobsUsed: 0,
      overageTraces: 0,
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      warningSentAt: null,
    });

    expect(decision.allowed).toBe(false);
  });

  it("treats an expired trial like the free tier for fine-tune launches", () => {
    const decision = canLaunchFineTune("free", {
      tracesUsed: 10,
      fineTuneJobsUsed: 0,
      overageTraces: 0,
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      warningSentAt: null,
    });

    expect(decision.allowed).toBe(false);
  });

  it("enforces starter limits after downgrading from pro", () => {
    const impact = getPlanDowngradeImpact("pro", "starter", 5);

    expect(impact.newTraceLimit).toBe(5000);
    expect(impact.newFineTuneLimit).toBe(1);
    expect(impact.overTeamMemberLimit).toBe(true);
  });

  it("calculates how many team members must be removed after downgrade", () => {
    const impact = getPlanDowngradeImpact("pro", "starter", 5);

    expect(impact.removableMemberCount).toBe(2);
  });

  it("preserves existing data while applying downgrade limits", () => {
    const impact = getPlanDowngradeImpact("team", "starter", 12);

    expect(impact.retainsExistingData).toBe(true);
  });

  it("calculates a one dollar overage for one thousand extra traces", () => {
    expect(calculateTraceOverageCharge(1000)).toBe(1);
  });

  it("shows overage in the dashboard usage meter", () => {
    const meter = getUsageMeter("starter", {
      tracesUsed: 6100,
      fineTuneJobsUsed: 1,
      overageTraces: 1100,
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z"),
      warningSentAt: null,
    });

    expect(meter.overageTraces).toBe(1100);
    expect(meter.overageCharge).toBe(1.1);
    expect(meter.overLimit).toBe(true);
  });

  it("flags the 80 percent threshold for usage warning emails", () => {
    expect(
      shouldSendUsageWarning(
        {
          tracesUsed: 4000,
          fineTuneJobsUsed: 0,
          overageTraces: 0,
          periodStart: new Date("2026-04-01T00:00:00.000Z"),
          periodEnd: new Date("2026-05-01T00:00:00.000Z"),
          warningSentAt: null,
        },
        "starter",
      ),
    ).toBe(true);
  });
});
