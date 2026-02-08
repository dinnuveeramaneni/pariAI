import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgRouteContext } from "@/lib/api-helpers";
import { updateMemberSchema } from "@/lib/validators";
import { writeAuditLog } from "@/lib/audit";

type Params = {
  params: Promise<{ orgId: string; memberId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const { orgId, memberId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const authz = await requireOrgRouteContext({
    orgId,
    minimumRole: OrganizationRole.ADMIN,
    payloadOrgId: parsed.data.orgId,
  });
  if (!authz.ok) {
    return authz.error;
  }

  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, orgId: authz.orgId },
    select: { id: true, userId: true, role: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (member.role === "OWNER" && parsed.data.role !== "OWNER") {
    const owners = await prisma.organizationMember.count({
      where: { orgId: authz.orgId, role: "OWNER" },
    });
    if (owners <= 1) {
      return NextResponse.json(
        { error: "At least one owner required" },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.organizationMember.update({
    where: { id: memberId },
    data: { role: parsed.data.role },
    select: { id: true, role: true, userId: true },
  });

  await writeAuditLog({
    orgId: authz.orgId,
    actorUserId: authz.userId,
    action: "member.role_update",
    targetType: "member",
    targetId: memberId,
    metadata: { role: parsed.data.role },
  });

  return NextResponse.json({ member: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { orgId, memberId } = await params;
  const authz = await requireOrgRouteContext({
    orgId,
    minimumRole: OrganizationRole.ADMIN,
  });
  if (!authz.ok) {
    return authz.error;
  }

  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, orgId: authz.orgId },
    select: { id: true, role: true, userId: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (member.role === "OWNER") {
    const owners = await prisma.organizationMember.count({
      where: { orgId: authz.orgId, role: "OWNER" },
    });
    if (owners <= 1) {
      return NextResponse.json(
        { error: "Cannot remove last owner" },
        { status: 400 },
      );
    }
  }

  await prisma.organizationMember.delete({ where: { id: memberId } });
  await writeAuditLog({
    orgId: authz.orgId,
    actorUserId: authz.userId,
    action: "member.remove",
    targetType: "member",
    targetId: memberId,
  });

  return NextResponse.json({ ok: true });
}
