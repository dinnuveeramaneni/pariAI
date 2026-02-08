import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createApiKeySchema } from "@/lib/validators";
import { requireOrgRouteContext } from "@/lib/api-helpers";
import { generateApiKey } from "@/lib/api-key";
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

  const keys = await prisma.apiKey.findMany({
    where: authz.whereOrg(),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });

  return NextResponse.json({ apiKeys: keys });
}

export async function POST(request: Request, { params }: Params) {
  const { orgId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createApiKeySchema.safeParse(body);
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

  const generated = generateApiKey();
  const apiKey = await prisma.apiKey.create({
    data: {
      orgId: authz.orgId,
      name: parsed.data.name,
      prefix: generated.prefix,
      secretHash: generated.secretHash,
      createdById: authz.userId,
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });

  await writeAuditLog({
    orgId: authz.orgId,
    actorUserId: authz.userId,
    action: "api_key.create",
    targetType: "api_key",
    targetId: apiKey.id,
  });

  return NextResponse.json(
    { apiKey, plaintext: generated.plaintext },
    { status: 201 },
  );
}
