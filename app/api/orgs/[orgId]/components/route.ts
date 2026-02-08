import { ComponentType, OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgRouteContext } from "@/lib/api-helpers";
import { ensureOrgComponents } from "@/lib/component-catalog";

type Params = {
  params: Promise<{ orgId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { orgId } = await params;
  const authz = await requireOrgRouteContext({
    orgId,
    minimumRole: OrganizationRole.VIEWER,
  });
  if (!authz.ok) {
    return authz.error;
  }
  await ensureOrgComponents(authz.orgId);

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const whereType =
    typeParam &&
    Object.values(ComponentType).includes(typeParam as ComponentType)
      ? (typeParam as ComponentType)
      : undefined;

  const components = await prisma.component.findMany({
    where: {
      orgId,
      ...(whereType ? { type: whereType } : {}),
    },
    orderBy: [{ type: "asc" }, { label: "asc" }],
  });

  return NextResponse.json({ components });
}
