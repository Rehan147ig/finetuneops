import { beforeEach, describe, expect, it, vi } from "vitest";

const { constructEvent, handleStripeWebhookEvent, getServerEnv } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  handleStripeWebhookEvent: vi.fn(),
  getServerEnv: vi.fn(() => ({
    STRIPE_WEBHOOK_SECRET: "whsec_test",
  })),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent,
    },
  }),
}));

vi.mock("@/lib/stripe-webhooks", () => ({
  handleStripeWebhookEvent,
}));

import { POST } from "./route";

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    constructEvent.mockImplementation((rawBody: string, signature: string) => {
      if (signature !== "sig_valid") {
        throw new Error("bad signature");
      }

      if (rawBody !== "raw-payload") {
        throw new Error("tampered payload");
      }

      return {
        id: "evt_1",
        type: "invoice.paid",
      };
    });
    handleStripeWebhookEvent.mockResolvedValue({
      processed: true,
      duplicate: false,
    });
  });

  it("passes through a valid signature", async () => {
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_valid",
        },
        body: "raw-payload",
      }),
    );

    expect(response.status).toBe(200);
    expect(constructEvent).toHaveBeenCalledWith("raw-payload", "sig_valid", "whsec_test");
    expect(handleStripeWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for an invalid signature", async () => {
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_invalid",
        },
        body: "raw-payload",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid signature",
    });
  });

  it("returns 400 when the signature header is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: "raw-payload",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid signature",
    });
  });

  it("returns 400 for a tampered payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_valid",
        },
        body: "different-payload",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid signature",
    });
  });
});
