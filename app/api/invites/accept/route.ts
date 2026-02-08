import crypto from "node:crypto";
import { MemberStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureOrgComponents } from "@/lib/component-catalog";
import { writeAuditLog } from "@/lib/audit";

const acceptSchema = z.object({
  token: z.string().min(20),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(parsed.data.token)
    .digest("hex");
  const invite = await prisma.invitation.findFirst({
    where: {
      tokenHash,
      email: session.user.email.toLowerCase(),
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!invite) {
    return NextResponse.json(
      { error: "Invalid or expired invite token" },
      { status: 404 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.upsert({
      where: {
        orgId_userId: {
          orgId: invite.orgId,
          userId: session.user.id,
        },
      },
      update: {
        role: invite.role,
        status: MemberStatus.ACTIVE,
      },
      create: {
        orgId: invite.orgId,
        userId: session.user.id,
        role: invite.role,
        status: MemberStatus.ACTIVE,
      },
    });

    await tx.invitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
  });

  await ensureOrgComponents(invite.orgId);
  await writeAuditLog({
    orgId: invite.orgId,
    actorUserId: session.user.id,
    action: "member.invite_accept",
    targetType: "invitation",
    targetId: invite.id,
  });

  return NextResponse.json({ orgId: invite.orgId });
}
