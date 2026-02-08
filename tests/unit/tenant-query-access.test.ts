import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const membershipFindUniqueMock = vi.fn();
const runFreeformQueryMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMember: {
      findUnique: membershipFindUniqueMock,
    },
  },
}));

vi.mock("@/lib/query-engine", () => ({
  runFreeformQuery: runFreeformQueryMock,
}));

describe("tenant isolation - query scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user_a" },
    });
    membershipFindUniqueMock.mockResolvedValue({
      id: "membership_a",
      orgId: "org_a",
      userId: "user_a",
      role: "VIEWER",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    runFreeformQueryMock.mockResolvedValue({
      columns: ["dimension", "metric:event_count"],
      rows: [],
      totals: {},
      queryMs: 1,
    });
  });

  it("query endpoint rejects org mismatch payload", async () => {
    const { POST } =
      await import("@/app/api/orgs/[orgId]/query/freeform/route");
    const response = await POST(
      new Request("http://localhost/api/orgs/org_a/query/freeform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: "org_b",
          rows: ["dimension:eventName"],
          columns: ["metric:event_count"],
          segments: [],
          dateRange: { type: "preset", value: "last_7_days" },
          limit: 50,
          offset: 0,
          sort: [],
        }),
      }),
      { params: Promise.resolve({ orgId: "org_a" }) },
    );

    expect(response.status).toBe(403);
    expect(runFreeformQueryMock).not.toHaveBeenCalled();
  });
});
