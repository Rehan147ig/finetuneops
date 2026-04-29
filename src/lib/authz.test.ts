import { describe, expect, it } from "vitest";

import {
  canDeployPrompts,
  canEditPrompts,
  canManageIntegrations,
  canReviewRelease,
  canViewAuditLog,
} from "@/lib/authz";

describe("authz", () => {
  it("does not allow engineers to review releases by rank inheritance", () => {
    expect(canReviewRelease("engineer")).toBe(false);
  });

  it("allows reviewers to deploy prompts", () => {
    expect(canDeployPrompts("reviewer")).toBe(true);
  });

  it("does not allow engineers to deploy prompts", () => {
    expect(canDeployPrompts("engineer")).toBe(false);
  });

  it("allows engineers to edit prompts", () => {
    expect(canEditPrompts("engineer")).toBe(true);
  });

  it("restricts integrations and audit log access to admins and owners", () => {
    expect(canManageIntegrations("admin")).toBe(true);
    expect(canManageIntegrations("reviewer")).toBe(false);
    expect(canViewAuditLog("owner")).toBe(true);
    expect(canViewAuditLog("viewer")).toBe(false);
  });
});
