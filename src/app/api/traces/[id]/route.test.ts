import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, auth } = vi.hoisted(() => ({
  mockPrisma: {
    traceEvent: {
      findFirst: vi.fn(),
    },
  },
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/auth", () => ({
  auth,
}));

import { GET } from "./route";

describe("GET /api/traces/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({
      user: {
        organizationId: "org_1",
      },
    });
  });

  it("returns the requested trace", async () => {
    mockPrisma.traceEvent.findFirst.mockResolvedValue({
      id: "trace_1",
      title: "Refund clarification trace",
    });

    const response = await GET(new Request("http://localhost/api/traces/trace_1"), {
      params: Promise.resolve({
        id: "trace_1",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.trace.id).toBe("trace_1");
  });

  it("returns 404 when the trace is missing", async () => {
    mockPrisma.traceEvent.findFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/traces/missing"), {
      params: Promise.resolve({
        id: "missing",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Trace not found.");
  });

  it("returns 401 when there is no authenticated workspace session", async () => {
    auth.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/traces/missing"), {
      params: Promise.resolve({
        id: "missing",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("You must be signed in to view traces.");
  });
});
