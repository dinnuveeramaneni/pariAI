import { describe, expect, it } from "vitest";
import { OrganizationRole } from "@prisma/client";
import {
  canEditProjects,
  canManageMembers,
  canViewWorkspace,
  hasRoleAtLeast,
} from "@/lib/rbac";

describe("rbac policy", () => {
  it("enforces role order", () => {
    expect(hasRoleAtLeast(OrganizationRole.OWNER, OrganizationRole.ADMIN)).toBe(
      true,
    );
    expect(
      hasRoleAtLeast(OrganizationRole.MEMBER, OrganizationRole.ADMIN),
    ).toBe(false);
  });

  it("maps permissions correctly", () => {
    expect(canManageMembers(OrganizationRole.ADMIN)).toBe(true);
    expect(canManageMembers(OrganizationRole.VIEWER)).toBe(false);
    expect(canEditProjects(OrganizationRole.MEMBER)).toBe(true);
    expect(canEditProjects(OrganizationRole.VIEWER)).toBe(false);
    expect(canViewWorkspace(OrganizationRole.VIEWER)).toBe(true);
  });
});
