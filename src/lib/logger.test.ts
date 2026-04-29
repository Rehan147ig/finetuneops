import { Writable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@/lib/logger";
import { workerLogger } from "@/workers/logger";

class MemoryStream extends Writable {
  chunks: string[] = [];

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(chunk.toString());
    callback();
  }

  readAll() {
    return this.chunks.join("");
  }
}

describe("logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not throw on valid structured input", () => {
    const stream = new MemoryStream();
    const logger = createLogger({
      service: "finetuneops-web-test",
      stream,
    });

    expect(() =>
      logger.info({
        event: "broadcast_complete",
        workspaceId: "org_1",
        jobId: "job_1",
        userId: "user_1",
        sentCount: 3,
      }),
    ).not.toThrow();
  });

  it("redacts sensitive fields from log output", () => {
    const stream = new MemoryStream();
    const logger = createLogger({
      service: "finetuneops-web-test",
      stream,
    });

    logger.info({
      event: "credential_created",
      apiKey: "sk-secret",
      webhookUrl: "https://hooks.slack.com/services/secret",
      headers: {
        authorization: "Bearer secret-token",
      },
    });

    const output = stream.readAll();
    expect(output).not.toContain("sk-secret");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("https://hooks.slack.com/services/secret");
    expect(output).toContain("[REDACTED]");
  });

  it("worker logger has the correct service tag", () => {
    const spy = vi.spyOn(workerLogger, "info").mockImplementation(() => workerLogger);

    workerLogger.info({
      event: "worker_booted",
    });

    expect(workerLogger.bindings().service).toBe("finetuneops-worker");
    expect(spy).toHaveBeenCalled();
  });
});
