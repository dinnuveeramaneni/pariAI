import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgRouteContext } from "@/lib/api-helpers";
import { generateApiKey } from "@/lib/api-key";
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
    where: { id: keyId, orgId, revokedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  const generated = generateApiKey();
  const rotated = await prisma.$transaction(async (tx) => {
    await tx.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    return tx.apiKey.create({
      data: {
        orgId,
        name: `${existing.name} (rotated)`,
        prefix: generated.prefix,
        secretHash: generated.secretHash,
        createdById: authz.userId,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
      },
    });
  });

  await writeAuditLog({
    orgId,
    actorUserId: authz.userId,
    action: "api_key.rotate",
    targetType: "api_key",
    targetId: keyId,
    metadata: { replacementKeyId: rotated.id },
  });

  return NextResponse.json(
    {
      apiKey: rotated,
      plaintext: generated.plaintext,
    },
    { status: 201 },
  );
}
