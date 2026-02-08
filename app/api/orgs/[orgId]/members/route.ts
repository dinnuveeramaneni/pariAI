import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgRouteContext } from "@/lib/api-helpers";

type Params = {
  params: Promise<{ orgId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { orgId } = await params;
  const authz = await requireOrgRouteContext({
    orgId,
    minimumRole: OrganizationRole.VIEWER,
  });
  if (!authz.ok) {
    return authz.error;
  }

  const members = await prisma.organizationMember.findMany({
    where: { orgId },
    include: {
      user: {
        select: { id: true, email: true, name: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    members: members.map((member) => ({
      id: member.id,
      role: member.role,
      status: member.status,
      user: member.user,
    })),
  });
}
