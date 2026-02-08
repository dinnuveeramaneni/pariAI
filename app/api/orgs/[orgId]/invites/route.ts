import crypto from "node:crypto";
import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgRouteContext } from "@/lib/api-helpers";
import { inviteSchema } from "@/lib/validators";
import { canManageMembers } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

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

  const invites = await prisma.invitation.findMany({
    where: authz.whereOrg(),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ invites });
}

export async function POST(request: Request, { params }: Params) {
  const { orgId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
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

  if (!canManageMembers(authz.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invite = await prisma.invitation.create({
    data: {
      orgId: authz.orgId,
      email: parsed.data.email,
      role: parsed.data.role,
      tokenHash,
      invitedById: authz.userId,
      expiresAt,
    },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
    },
  });

  await writeAuditLog({
    orgId: authz.orgId,
    actorUserId: authz.userId,
    action: "member.invite",
    targetType: "invitation",
    targetId: invite.id,
    metadata: { email: parsed.data.email, role: parsed.data.role },
  });

  // Returning token for MVP local use; production should send via email.
  return NextResponse.json({ invite, token }, { status: 201 });
}
