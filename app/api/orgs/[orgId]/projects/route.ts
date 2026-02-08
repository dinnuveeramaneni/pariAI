import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgRouteContext } from "@/lib/api-helpers";
import { createProjectSchema } from "@/lib/validators";
import {
  buildDefaultProjectPayload,
  LATEST_PROJECT_SCHEMA_VERSION,
} from "@/lib/project-schema";
import { canEditProjects } from "@/lib/rbac";
import { sha256 } from "@/lib/util";
import { writeAuditLog } from "@/lib/audit";

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

  const projects = await prisma.project.findMany({
    where: authz.whereOrg({ archivedAt: null }),
    orderBy: { updatedAt: "desc" },
    include: {
      versions: {
        take: 1,
        orderBy: { versionNo: "desc" },
        select: { versionNo: true, schemaVersion: true, createdAt: true },
      },
    },
  });

  return NextResponse.json({
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      latestVersion: project.versions[0] ?? null,
    })),
  });
}

export async function POST(request: Request, { params }: Params) {
  const { orgId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const authz = await requireOrgRouteContext({
    orgId,
    minimumRole: OrganizationRole.MEMBER,
    payloadOrgId: parsed.data.orgId,
  });
  if (!authz.ok) {
    return authz.error;
  }
  if (!canEditProjects(authz.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = buildDefaultProjectPayload(parsed.data.name);
  const payloadString = JSON.stringify(payload);
  const checksum = sha256(payloadString);

  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        orgId: authz.orgId,
        name: parsed.data.name,
        description: parsed.data.description,
        createdById: authz.userId,
      },
    });

    const version = await tx.projectVersion.create({
      data: {
        projectId: project.id,
        orgId: authz.orgId,
        versionNo: 1,
        schemaVersion: LATEST_PROJECT_SCHEMA_VERSION,
        payload: payload as object,
        checksum,
        createdById: authz.userId,
      },
      select: {
        id: true,
        versionNo: true,
        schemaVersion: true,
        createdAt: true,
      },
    });

    return { project, version };
  });

  await writeAuditLog({
    orgId: authz.orgId,
    actorUserId: authz.userId,
    action: "project.create",
    targetType: "project",
    targetId: result.project.id,
  });

  return NextResponse.json(
    {
      project: {
        id: result.project.id,
        name: result.project.name,
        description: result.project.description,
        latestVersion: result.version,
      },
    },
    { status: 201 },
  );
}
