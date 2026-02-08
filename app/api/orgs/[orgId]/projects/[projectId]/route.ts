import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrgRouteContext } from "@/lib/api-helpers";
import { migrateProjectPayload } from "@/lib/project-schema";
import { canEditProjects } from "@/lib/rbac";
import { ensureOrgSampleEvents } from "@/lib/sample-data";
import { clearQueryCacheForOrg } from "@/lib/query-cache";

type Params = {
  params: Promise<{ orgId: string; projectId: string }>;
};

const updateProjectSchema = z.object({
  orgId: z.string().min(1).optional(),
  name: z.string().trim().min(2).max(140).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  const { orgId, projectId } = await params;
  const authz = await requireOrgRouteContext({
    orgId,
    minimumRole: OrganizationRole.VIEWER,
  });
  if (!authz.ok) {
    return authz.error;
  }
  await ensureOrgSampleEvents(authz.orgId);
  clearQueryCacheForOrg(authz.orgId);

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...authz.whereOrg({ archivedAt: null }) },
    include: {
      versions: {
        orderBy: { versionNo: "desc" },
        take: 1,
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const latest = project.versions[0];
  const payload = latest
    ? migrateProjectPayload(latest.payload, latest.schemaVersion)
    : null;

  return NextResponse.json({
    project: {
      id: project.id,
      orgId: project.orgId,
      name: project.name,
      description: project.description,
      updatedAt: project.updatedAt,
      latestVersion: latest
        ? {
            versionNo: latest.versionNo,
            schemaVersion: latest.schemaVersion,
            createdAt: latest.createdAt,
          }
        : null,
      payload,
    },
  });
}

export async function PUT(request: Request, { params }: Params) {
  const { orgId, projectId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body);
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

  const updateData = { ...parsed.data };
  delete updateData.orgId;

  const updated = await prisma.project.updateMany({
    where: { id: projectId, orgId: authz.orgId },
    data: updateData,
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
