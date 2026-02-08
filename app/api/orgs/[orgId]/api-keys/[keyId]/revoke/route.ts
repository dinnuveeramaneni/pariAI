import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgRouteContext } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

type Params = {
  params: Promise<{ orgId: string; keyId: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const { orgId, keyId } = await params;
  const authz = await requireOrgRouteContext({
    orgId,
    minimumRole: OrganizationRole.ADMIN,
  });
  if (!authz.ok) {
    return authz.error;
  }

  const existing = await prisma.apiKey.findFirst({
    where: { id: keyId, orgId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  });

  await writeAuditLog({
    orgId,
    actorUserId: authz.userId,
    action: "api_key.revoke",
    targetType: "api_key",
    targetId: keyId,
  });

  return NextResponse.json({ ok: true });
}
