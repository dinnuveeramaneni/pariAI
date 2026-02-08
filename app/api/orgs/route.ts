import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createOrgSchema } from "@/lib/validators";
import { ensureOrgComponents } from "@/lib/component-catalog";
import { ensureOrgSampleEvents } from "@/lib/sample-data";
import { slugify } from "@/lib/util";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgs = await prisma.organizationMember.findMany({
    where: { userId: session.user.id },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    organizations: orgs.map((member) => ({
      id: member.org.id,
      name: member.org.name,
      slug: member.org.slug,
      role: member.role,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const baseSlug = slugify(parsed.data.name);
  let slug = baseSlug;
  let suffix = 1;
  // Keep slug creation deterministic and unique.
  while (
    await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    })
  ) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const org = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      slug,
      createdById: session.user.id,
      memberships: {
        create: {
          userId: session.user.id,
          role: OrganizationRole.OWNER,
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  await ensureOrgComponents(org.id);
  await ensureOrgSampleEvents(org.id);
  await writeAuditLog({
    orgId: org.id,
    actorUserId: session.user.id,
    action: "org.create",
    targetType: "organization",
    targetId: org.id,
  });

  return NextResponse.json({ organization: org }, { status: 201 });
}
