export type ReviewDecision = "approved" | "changes_requested";

export function generateReviewToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

export function getReviewLinkExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export function isReviewLinkExpired(input: {
  expiresAt: Date;
  decidedAt?: Date | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  return Boolean(input.decidedAt) || input.expiresAt.getTime() <= now.getTime();
}
