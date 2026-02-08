import { OrganizationRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireBodyOrgContext } from "@/lib/api-helpers";
import {
  buildQueryCacheKey,
  getCachedQuery,
  setCachedQuery,
} from "@/lib/query-cache";
import { runTimeseriesQuery } from "@/lib/query-engine-sql";
import { queryTimeseriesSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = queryTimeseriesSchema.safeParse(body);
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

  const cacheKey = buildQueryCacheKey(
    "timeseries",
    parsed.data.orgId,
    parsed.data,
  );
  const cached = getCachedQuery<{
    series: Array<{ bucket: string; dimension?: string | null; value: number }>;
  }>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const result = await runTimeseriesQuery(parsed.data);
    setCachedQuery(cacheKey, result);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
