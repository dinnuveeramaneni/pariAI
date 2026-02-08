import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const membershipFindUniqueMock = vi.fn();
const runTableQueryMock = vi.fn();

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

vi.mock("@/lib/query-engine-sql", () => ({
  runTableQuery: runTableQueryMock,
}));

describe("query/table route tenant protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user_a" },
    });
    membershipFindUniqueMock.mockImplementation(({ where }) => {
      if (where.orgId_userId.orgId !== "org_a") {
        return null;
      }

      return {
        id: "membership_a",
        orgId: "org_a",
        userId: "user_a",
        role: "VIEWER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
    runTableQueryMock.mockResolvedValue({
      columns: ["events"],
      rows: [],
      totals: { events: 0 },
    });
  });

  it("rejects user querying a tenant they are not a member of", async () => {
    const { POST } = await import("@/app/api/query/table/route");
    const response = await POST(
      new Request("http://localhost/api/query/table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: "org_b",
          dateRange: { from: "2026-02-01", to: "2026-02-07" },
          rows: ["channel"],
          metrics: ["events"],
          limit: 20,
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(runTableQueryMock).not.toHaveBeenCalled();
  });
});
