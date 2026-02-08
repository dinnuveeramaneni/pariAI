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
    minimumRole: OrganizationRole.ADMIN,
  });
  if (!authz.ok) {
    return authz.error;
  }

  const logs = await prisma.auditLog.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ logs });
}
