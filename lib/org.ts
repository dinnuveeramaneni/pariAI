import { prisma } from "@/lib/prisma";

export async function getUserOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((membership) => ({
    orgId: membership.orgId,
    name: membership.org.name,
    slug: membership.org.slug,
    role: membership.role,
  }));
}

export async function resolveOrgForUser(
  userId: string,
  requestedOrgId?: string | null,
) {
  const orgs = await getUserOrganizations(userId);
  if (orgs.length === 0) {
    return null;
  }

  if (requestedOrgId) {
    const match = orgs.find((org) => org.orgId === requestedOrgId);
    if (match) {
      return match;
    }
  }

  return orgs[0];
}
