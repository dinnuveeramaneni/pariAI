import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireOrgRouteContext } from "@/lib/api-helpers";
import { freeformQuerySchema } from "@/lib/validators";
import { runFreeformQuery } from "@/lib/query-engine";

type Params = {
  params: Promise<{ orgId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const { orgId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = freeformQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const authz = await requireOrgRouteContext({
    orgId,
    minimumRole: OrganizationRole.VIEWER,
    payloadOrgId: parsed.data.orgId,
  });
  if (!authz.ok) {
    return authz.error;
  }

  const result = await runFreeformQuery(authz.orgId, parsed.data);
  return NextResponse.json(result);
}
