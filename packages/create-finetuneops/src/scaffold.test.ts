import { describe, expect, it } from "vitest";
import { buildEnvFile, formatNextSteps, shouldCopyPath } from "./scaffold";

describe("create-finetuneops scaffold helpers", () => {
  it("builds a complete env file for a new workspace", () => {
    const envFile = buildEnvFile({
      appUrl: "http://localhost:3000",
      databaseUrl: "postgresql://demo",
      openAiKey: "sk-demo",
      redisUrl: "redis://redis:6379",
    });

    expect(envFile).toContain('DATABASE_URL="postgresql://demo"');
    expect(envFile).toContain('REDIS_URL="redis://redis:6379"');
    expect(envFile).toContain('OPENAI_API_KEY="sk-demo"');
    expect(envFile).toContain('RUN_DEMO_SEED="true"');
  });

  it("prints clear next steps for booting the stack", () => {
    const nextSteps = formatNextSteps("my-workspace");

    expect(nextSteps).toContain("cd my-workspace");
    expect(nextSteps).toContain("docker compose up --build");
    expect(nextSteps).toContain("Open http://localhost:3000");
  });

  it("skips heavy or local-only paths when copying the template", () => {
    expect(shouldCopyPath("src/app/page.tsx")).toBe(true);
    expect(shouldCopyPath("node_modules/redis/index.js")).toBe(false);
    expect(shouldCopyPath(".git/config")).toBe(false);
  });
});
