import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, getQueueStats } = vi.hoisted(() => ({
  auth: vi.fn(),
  getQueueStats: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth,
}));

vi.mock("@/lib/queue-monitor", () => ({
  getQueueStats,
}));

import { GET } from "./route";

describe("GET /api/admin/queues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns queue stats with checkedAt timestamp", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
      },
    });
    getQueueStats.mockResolvedValue([
      {
        name: "ingest-trace",
        waiting: 10,
        active: 1,
        level: "ok",
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.queues).toHaveLength(1);
    expect(body.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns anyWarning true when warning queue present", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
      },
    });
    getQueueStats.mockResolvedValue([
      {
        name: "ingest-trace",
        waiting: 500,
        active: 2,
        level: "warning",
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body.anyWarning).toBe(true);
    expect(body.anyCritical).toBe(false);
  });

  it("returns anyCritical true when critical queue present", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
      },
    });
    getQueueStats.mockResolvedValue([
      {
        name: "ingest-trace",
        waiting: 2000,
        active: 2,
        level: "critical",
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body.anyWarning).toBe(true);
    expect(body.anyCritical).toBe(true);
  });

  it("requires authenticated session", async () => {
    auth.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authentication required.");
  });
});
