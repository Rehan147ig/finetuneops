import { beforeEach, describe, expect, it, vi } from "vitest";
import { idleActionResult } from "@/lib/action-state";

const { hash, createWorkspaceUser, userFindUnique, loggerError } = vi.hoisted(() => ({
  hash: vi.fn(),
  createWorkspaceUser: vi.fn(),
  userFindUnique: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  hash,
}));

vi.mock("@/lib/onboarding", () => ({
  createWorkspaceUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUnique,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerError,
  },
}));

import { signUpAction } from "./actions";

function buildFormData(input: {
  name?: string;
  email?: string;
  password?: string;
  workspaceName?: string;
}) {
  const formData = new FormData();
  formData.set("name", input.name ?? "Rehan Founder");
  formData.set("email", input.email ?? "rehan@example.com");
  formData.set("password", input.password ?? "password123");
  if (input.workspaceName) {
    formData.set("workspaceName", input.workspaceName);
  }
  return formData;
}

describe("signUpAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hash.mockResolvedValue("hashed_password");
    userFindUnique.mockResolvedValue(null);
    createWorkspaceUser.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1" },
    });
  });

  it("creates a workspace user when sign-up details are valid", async () => {
    const result = await signUpAction(idleActionResult, buildFormData({}));

    expect(result.status).toBe("success");
    expect(createWorkspaceUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "rehan@example.com",
        passwordHash: "hashed_password",
      }),
    );
  });

  it("returns an error when the email already exists", async () => {
    userFindUnique.mockResolvedValue({ id: "existing_user" });

    const result = await signUpAction(idleActionResult, buildFormData({}));

    expect(result.status).toBe("error");
    expect(result.title).toBe("Account exists");
    expect(createWorkspaceUser).not.toHaveBeenCalled();
  });

  it("does not throw when workspace creation fails", async () => {
    createWorkspaceUser.mockRejectedValue(new Error("Unique constraint failed on Project.slug"));

    const result = await signUpAction(idleActionResult, buildFormData({}));

    expect(result.status).toBe("error");
    expect(result.title).toBe("Workspace creation failed");
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "signup_workspace_creation_failed",
      }),
    );
  });
});
