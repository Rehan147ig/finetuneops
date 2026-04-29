import { describe, expect, it } from "vitest";
import {
  generateReviewToken,
  getReviewLinkExpiry,
  isReviewLinkExpired,
} from "./review-links";

describe("generateReviewToken", () => {
  it("creates a long secure-looking token", () => {
    const token = generateReviewToken();

    expect(token.length).toBeGreaterThanOrEqual(24);
  });
});

describe("getReviewLinkExpiry", () => {
  it("expires seven days after creation", () => {
    const createdAt = new Date("2026-04-20T00:00:00.000Z");
    expect(getReviewLinkExpiry(createdAt).toISOString()).toBe(
      "2026-04-27T00:00:00.000Z",
    );
  });
});

describe("isReviewLinkExpired", () => {
  it("expires a link after its decision is recorded", () => {
    expect(
      isReviewLinkExpired({
        expiresAt: new Date("2026-04-27T00:00:00.000Z"),
        decidedAt: new Date("2026-04-21T00:00:00.000Z"),
        now: new Date("2026-04-22T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("expires a link after seven days", () => {
    expect(
      isReviewLinkExpired({
        expiresAt: new Date("2026-04-27T00:00:00.000Z"),
        now: new Date("2026-04-28T00:00:00.000Z"),
      }),
    ).toBe(true);
  });
});
