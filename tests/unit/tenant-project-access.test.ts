import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const membershipFindUniqueMock = vi.fn();
const projectFindManyMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMember: {
      findUnique: membershipFindUniqueMock,
    },
    project: {
      findMany: projectFindManyMock,
    },
  },
}));

describe("tenant isolation - project access", () => {
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
    projectFindManyMock.mockResolvedValue([]);
  });

  it("user A cannot read org B projects", async () => {
    const { GET } = await import("@/app/api/orgs/[orgId]/projects/route");
    const response = await GET(
      new Request("http://localhost/api/orgs/org_b/projects"),
      {
        params: Promise.resolve({ orgId: "org_b" }),
      },
    );

    expect(response.status).toBe(403);
    expect(projectFindManyMock).not.toHaveBeenCalled();
  });
});
