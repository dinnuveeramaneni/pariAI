import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgRouteContext } from "@/lib/api-helpers";
import { canEditProjects } from "@/lib/rbac";
import { saveProjectVersionSchema } from "@/lib/validators";
import {
  LATEST_PROJECT_SCHEMA_VERSION,
  migrateProjectPayload,
} from "@/lib/project-schema";
import { sha256 } from "@/lib/util";
import { writeAuditLog } from "@/lib/audit";

type Params = {
  params: Promise<{ orgId: string; projectId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { orgId, projectId } = await params;
  const authz = await requireOrgRouteContext({
    orgId,
    minimumRole: OrganizationRole.VIEWER,
  });
  if (!authz.ok) {
    return authz.error;
  }

  const versions = await prisma.projectVersion.findMany({
    where: authz.whereOrg({ projectId }),
    orderBy: { versionNo: "desc" },
    select: {
      id: true,
      versionNo: true,
      schemaVersion: true,
      createdAt: true,
      createdById: true,
    },
  });

  return NextResponse.json({ versions });
}

export async function POST(request: Request, { params }: Params) {
  const { orgId, projectId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = saveProjectVersionSchema.safeParse(body);
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

  const normalizedPayload = migrateProjectPayload(
    parsed.data.payload,
    parsed.data.schemaVersion,
  );
  const payloadString = JSON.stringify(normalizedPayload);
  const checksum = sha256(payloadString);

  const saved = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, orgId: authz.orgId },
      select: { id: true },
    });
    if (!project) {
      return null;
    }

    const latestVersion = await tx.projectVersion.findFirst({
      where: { orgId: authz.orgId, projectId },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true },
    });
    const nextVersion = (latestVersion?.versionNo ?? 0) + 1;

    const version = await tx.projectVersion.create({
      data: {
        projectId,
        orgId: authz.orgId,
        versionNo: nextVersion,
        schemaVersion: LATEST_PROJECT_SCHEMA_VERSION,
        payload: normalizedPayload as object,
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

    await tx.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });

    return version;
  });

  if (!saved) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await writeAuditLog({
    orgId: authz.orgId,
    actorUserId: authz.userId,
    action: "project.save",
    targetType: "project",
    targetId: projectId,
    metadata: { versionNo: saved.versionNo },
  });

  return NextResponse.json({ version: saved }, { status: 201 });
}
