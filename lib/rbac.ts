import { OrganizationRole } from "@prisma/client";

const roleRank: Record<OrganizationRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

export function hasRoleAtLeast(
  role: OrganizationRole,
  minimum: OrganizationRole,
): boolean {
  return roleRank[role] >= roleRank[minimum];
}

export function canManageMembers(role: OrganizationRole): boolean {
  return hasRoleAtLeast(role, OrganizationRole.ADMIN);
}

export function canEditProjects(role: OrganizationRole): boolean {
  return hasRoleAtLeast(role, OrganizationRole.MEMBER);
}

export function canViewWorkspace(role: OrganizationRole): boolean {
  return hasRoleAtLeast(role, OrganizationRole.VIEWER);
}
