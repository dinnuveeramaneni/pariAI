import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireBodyOrgContext } from "@/lib/api-helpers";
import {
  buildQueryCacheKey,
  getCachedQuery,
  setCachedQuery,
} from "@/lib/query-cache";
import { runTableQuery } from "@/lib/query-engine-sql";
import { queryTableSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = queryTableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const authz = await requireBodyOrgContext({
    orgId: parsed.data.orgId,
    minimumRole: OrganizationRole.VIEWER,
  });
  if (!authz.ok) {
    return authz.error;
  }

  const cacheKey = buildQueryCacheKey("table", parsed.data.orgId, parsed.data);
  const cached = getCachedQuery<{
    columns: string[];
    rows: Array<Record<string, string | number | null>>;
    totals: Record<string, number>;
  }>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const result = await runTableQuery(parsed.data);
    setCachedQuery(cacheKey, result);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
