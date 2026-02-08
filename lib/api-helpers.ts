import { type OrganizationMember, OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRoleAtLeast } from "@/lib/rbac";

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function requireUser(): Promise<
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      error: NextResponse;
    }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: jsonError("Unauthorized", 401) };
  }

  return { ok: true, userId: session.user.id };
}

export async function requireOrgMembership(
  orgId: string,
  minimumRole: OrganizationRole = OrganizationRole.VIEWER,
): Promise<
  | {
      ok: true;
      userId: string;
      membership: OrganizationMember;
    }
  | {
      ok: false;
      error: NextResponse;
    }
> {
  const userResult = await requireUser();
  if (!userResult.ok) {
    return userResult;
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      orgId_userId: {
        orgId,
        userId: userResult.userId,
      },
    },
  });

  if (!membership || !hasRoleAtLeast(membership.role, minimumRole)) {
    return { ok: false, error: jsonError("Forbidden", 403) };
  }

  return {
    ok: true,
    userId: userResult.userId,
    membership,
  };
}

export function ensureOrgIdMatch(
  expectedOrgId: string,
  providedOrgId?: string | null,
): { ok: true } | { ok: false; error: NextResponse } {
  if (!providedOrgId || providedOrgId === expectedOrgId) {
    return { ok: true };
  }

  return {
    ok: false,
    error: jsonError("orgId mismatch", 403),
  };
}

export async function requireOrgRouteContext({
  orgId,
  minimumRole = OrganizationRole.VIEWER,
  payloadOrgId,
}: {
  orgId: string;
  minimumRole?: OrganizationRole;
  payloadOrgId?: string | null;
}): Promise<
  | {
      ok: true;
      orgId: string;
      userId: string;
      membership: OrganizationMember;
      whereOrg: <T extends Record<string, unknown>>(
        extra?: T,
      ) => T & { orgId: string };
    }
  | {
      ok: false;
      error: NextResponse;
    }
> {
  const orgMatch = ensureOrgIdMatch(orgId, payloadOrgId);
  if (!orgMatch.ok) {
    return orgMatch;
  }

  const authz = await requireOrgMembership(orgId, minimumRole);
  if (!authz.ok) {
    return authz;
  }

  return {
    ok: true,
    orgId,
    userId: authz.userId,
    membership: authz.membership,
    whereOrg: <T extends Record<string, unknown>>(extra?: T) =>
      ({ orgId, ...(extra ?? ({} as T)) }) as T & { orgId: string },
  };
}

export async function requireBodyOrgContext({
  orgId,
  minimumRole = OrganizationRole.VIEWER,
}: {
  orgId: string;
  minimumRole?: OrganizationRole;
}): Promise<
  | {
      ok: true;
      orgId: string;
      userId: string;
      membership: OrganizationMember;
      whereOrg: <T extends Record<string, unknown>>(
        extra?: T,
      ) => T & { orgId: string };
    }
  | {
      ok: false;
      error: NextResponse;
    }
> {
  const authz = await requireOrgMembership(orgId, minimumRole);
  if (!authz.ok) {
    return authz;
  }

  return {
    ok: true,
    orgId,
    userId: authz.userId,
    membership: authz.membership,
    whereOrg: <T extends Record<string, unknown>>(extra?: T) =>
      ({ orgId, ...(extra ?? ({} as T)) }) as T & { orgId: string },
  };
}

export async function getPrimaryOrgIdForUser(
  userId: string,
): Promise<string | null> {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  return membership?.orgId ?? null;
}
