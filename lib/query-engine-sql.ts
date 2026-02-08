import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  QueryTableInput,
  QueryTimeseriesInput,
  SegmentDslInput,
} from "@/lib/validators";
import type { DimensionKey, MetricKey } from "@/lib/semantic-layer";

type SortDirection = "asc" | "desc";
type FieldType = "text" | "number" | "date";
type EventSnapshot = {
  eventName: string;
  timestamp: Date;
  userId: string | null;
  properties: Record<string, unknown> | null;
};
type SegmentDslRule = Extract<SegmentDslInput["rules"][number], { field: string }>;

type SegmentField = {
  expr: Prisma.Sql;
  type: FieldType;
};

function parseDate(value: string, mode: "start" | "end"): Date {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (isDateOnly) {
    const suffix = mode === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    return new Date(`${value}${suffix}`);
  }

  return new Date(value);
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatHour(value: Date): string {
  return `${value.toISOString().slice(0, 13)}:00:00Z`;
}

function readDimensionFromEvent(
  event: EventSnapshot,
  dimension: DimensionKey,
): string {
  const props = event.properties ?? {};
  if (dimension === "channel") {
    return String(props.channel ?? "(none)");
  }
  if (dimension === "brand") {
    return String(props.brand ?? "(none)");
  }
  if (dimension === "product") {
    return String(props.product ?? "(none)");
  }
  if (dimension === "campaign") {
    return String(props.campaign ?? "(none)");
  }
  if (dimension === "eventName") {
    return String(event.eventName ?? "(none)");
  }
  if (dimension === "hour") {
    return formatHour(event.timestamp);
  }
  return formatDay(event.timestamp);
}

function readRevenue(event: EventSnapshot): number {
  const raw = (event.properties ?? {}).revenue;
  return toNumber(raw);
}

function readNetDemand(event: EventSnapshot): number {
  const raw = (event.properties ?? {}).netDemand;
  return toNumber(raw);
}

function readSegmentFieldValue(event: EventSnapshot, field: string): unknown {
  if (field === "channel") {
    return (event.properties ?? {}).channel ?? "";
  }
  if (field === "brand") {
    return (event.properties ?? {}).brand ?? "";
  }
  if (field === "product") {
    return (event.properties ?? {}).product ?? "";
  }
  if (field === "campaign") {
    return (event.properties ?? {}).campaign ?? "";
  }
  if (field === "eventName") {
    return event.eventName ?? "";
  }
  if (field === "userId") {
    return event.userId ?? "";
  }
  if (field === "day") {
    return formatDay(event.timestamp);
  }
  if (field === "revenue") {
    return readRevenue(event);
  }
  if (field === "netDemand") {
    return readNetDemand(event);
  }
  return "";
}

function isNumericOp(op: SegmentDslInput["rules"][number]["op"]): boolean {
  return op === "gt" || op === "gte" || op === "lt" || op === "lte";
}

function matchesSegmentRule(
  event: EventSnapshot,
  rule: SegmentDslRule,
): boolean {
  const value = readSegmentFieldValue(event, rule.field);

  if (rule.op === "contains") {
    return String(value).toLowerCase().includes(String(rule.value).toLowerCase());
  }

  if (rule.op === "in") {
    return (
      Array.isArray(rule.value) &&
      rule.value.some((entry) => String(entry) === String(value))
    );
  }

  if (isNumericOp(rule.op)) {
    const left = toNumber(value);
    const right = toNumber(rule.value);
    if (rule.op === "gt") {
      return left > right;
    }
    if (rule.op === "gte") {
      return left >= right;
    }
    if (rule.op === "lt") {
      return left < right;
    }
    return left <= right;
  }

  if (rule.op === "eq") {
    return String(value) === String(rule.value);
  }
  if (rule.op === "neq") {
    return String(value) !== String(rule.value);
  }

  return false;
}

function matchesSegmentDsl(
  event: EventSnapshot,
  segmentDsl?: SegmentDslInput,
): boolean {
  if (!segmentDsl) {
    return true;
  }

  const checks = segmentDsl.rules.map((ruleOrGroup) => {
    if ("field" in ruleOrGroup) {
      return matchesSegmentRule(event, ruleOrGroup);
    }

    const nestedChecks = ruleOrGroup.rules.map((rule) =>
      matchesSegmentRule(event, rule),
    );
    return ruleOrGroup.op === "AND"
      ? nestedChecks.every(Boolean)
      : nestedChecks.some(Boolean);
  });

  return segmentDsl.op === "AND" ? checks.every(Boolean) : checks.some(Boolean);
}

function dayBucketExpr(): Prisma.Sql {
  return Prisma.sql`TO_CHAR(DATE_TRUNC('day', "timestamp"), 'YYYY-MM-DD')`;
}

function hourBucketExpr(): Prisma.Sql {
  return Prisma.sql`TO_CHAR(DATE_TRUNC('hour', "timestamp"), 'YYYY-MM-DD"T"HH24:00:00"Z"')`;
}

function safeRevenueExpr(): Prisma.Sql {
  return Prisma.sql`CASE
    WHEN ("properties"->>'revenue') ~ '^-?[0-9]+(\\.[0-9]+)?$'
    THEN ("properties"->>'revenue')::numeric
    ELSE 0
  END`;
}

function safeNetDemandExpr(): Prisma.Sql {
  return Prisma.sql`CASE
    WHEN ("properties"->>'netDemand') ~ '^-?[0-9]+(\\.[0-9]+)?$'
    THEN ("properties"->>'netDemand')::numeric
    ELSE 0
  END`;
}

function getDimensionExpr(dimension: DimensionKey): Prisma.Sql {
  if (dimension === "channel") {
    return Prisma.sql`COALESCE("properties"->>'channel', '(none)')`;
  }
  if (dimension === "brand") {
    return Prisma.sql`COALESCE("properties"->>'brand', '(none)')`;
  }
  if (dimension === "product") {
    return Prisma.sql`COALESCE("properties"->>'product', '(none)')`;
  }
  if (dimension === "campaign") {
    return Prisma.sql`COALESCE("properties"->>'campaign', '(none)')`;
  }
  if (dimension === "eventName") {
    return Prisma.sql`COALESCE("eventName", '(none)')`;
  }
  if (dimension === "hour") {
    return hourBucketExpr();
  }

  return dayBucketExpr();
}

function getMetricExpr(metric: MetricKey): Prisma.Sql {
  if (metric === "events") {
    return Prisma.sql`COUNT(*)::bigint`;
  }
  if (metric === "users") {
    return Prisma.sql`COUNT(DISTINCT "userId")::bigint`;
  }
  if (metric === "revenue") {
    return Prisma.sql`COALESCE(SUM(${safeRevenueExpr()}), 0)`;
  }
  return Prisma.sql`COALESCE(SUM(${safeNetDemandExpr()}), 0)`;
}

function getSegmentField(field: string): SegmentField {
  if (field === "channel") {
    return {
      expr: Prisma.sql`COALESCE("properties"->>'channel', '')`,
      type: "text",
    };
  }
  if (field === "brand") {
    return {
      expr: Prisma.sql`COALESCE("properties"->>'brand', '')`,
      type: "text",
    };
  }
  if (field === "product") {
    return {
      expr: Prisma.sql`COALESCE("properties"->>'product', '')`,
      type: "text",
    };
  }
  if (field === "campaign") {
    return {
      expr: Prisma.sql`COALESCE("properties"->>'campaign', '')`,
      type: "text",
    };
  }
  if (field === "eventName") {
    return { expr: Prisma.sql`COALESCE("eventName", '')`, type: "text" };
  }
  if (field === "userId") {
    return { expr: Prisma.sql`COALESCE("userId", '')`, type: "text" };
  }
  if (field === "day") {
    return { expr: Prisma.sql`DATE_TRUNC('day', "timestamp")`, type: "date" };
  }
  if (field === "revenue") {
    return { expr: safeRevenueExpr(), type: "number" };
  }
  if (field === "netDemand") {
    return { expr: safeNetDemandExpr(), type: "number" };
  }

  throw new Error(`Unsupported segment field: ${field}`);
}

function buildRuleSql(rule: {
  field: string;
  op: "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte" | "in";
  value: string | number | boolean | Array<string | number | boolean>;
}): Prisma.Sql {
  const field = getSegmentField(rule.field);
  const op = rule.op;

  if (op === "in") {
    if (!Array.isArray(rule.value) || rule.value.length === 0) {
      throw new Error("Segment 'in' operator requires non-empty array value");
    }
    return Prisma.sql`${field.expr} IN (${Prisma.join(rule.value)})`;
  }

  if (field.type === "text") {
    const value = String(rule.value);
    if (op === "eq") {
      return Prisma.sql`${field.expr} = ${value}`;
    }
    if (op === "neq") {
      return Prisma.sql`${field.expr} <> ${value}`;
    }
    if (op === "contains") {
      return Prisma.sql`${field.expr} ILIKE ${`%${value}%`}`;
    }
    throw new Error(
      `Operator '${op}' is not valid for text field '${rule.field}'`,
    );
  }

  if (field.type === "number") {
    const value = Number(rule.value);
    if (!Number.isFinite(value)) {
      throw new Error(
        `Numeric segment value expected for field '${rule.field}'`,
      );
    }
    if (op === "eq") {
      return Prisma.sql`${field.expr} = ${value}`;
    }
    if (op === "neq") {
      return Prisma.sql`${field.expr} <> ${value}`;
    }
    if (op === "gt") {
      return Prisma.sql`${field.expr} > ${value}`;
    }
    if (op === "gte") {
      return Prisma.sql`${field.expr} >= ${value}`;
    }
    if (op === "lt") {
      return Prisma.sql`${field.expr} < ${value}`;
    }
    if (op === "lte") {
      return Prisma.sql`${field.expr} <= ${value}`;
    }
    throw new Error(
      `Operator '${op}' is not valid for numeric field '${rule.field}'`,
    );
  }

  const dateValue = parseDate(String(rule.value), "start");
  if (op === "eq") {
    return Prisma.sql`${field.expr} = DATE_TRUNC('day', CAST(${dateValue} AS timestamp))`;
  }
  if (op === "neq") {
    return Prisma.sql`${field.expr} <> DATE_TRUNC('day', CAST(${dateValue} AS timestamp))`;
  }
  if (op === "gt") {
    return Prisma.sql`${field.expr} > DATE_TRUNC('day', CAST(${dateValue} AS timestamp))`;
  }
  if (op === "gte") {
    return Prisma.sql`${field.expr} >= DATE_TRUNC('day', CAST(${dateValue} AS timestamp))`;
  }
  if (op === "lt") {
    return Prisma.sql`${field.expr} < DATE_TRUNC('day', CAST(${dateValue} AS timestamp))`;
  }
  if (op === "lte") {
    return Prisma.sql`${field.expr} <= DATE_TRUNC('day', CAST(${dateValue} AS timestamp))`;
  }
  throw new Error(
    `Operator '${op}' is not valid for date field '${rule.field}'`,
  );
}

function buildSegmentSql(segmentDsl: SegmentDslInput): Prisma.Sql {
  const joiner = segmentDsl.op === "AND" ? " AND " : " OR ";

  const parts = segmentDsl.rules.map((ruleOrGroup) => {
    if ("field" in ruleOrGroup) {
      return buildRuleSql(ruleOrGroup);
    }

    const nestedJoiner = ruleOrGroup.op === "AND" ? " AND " : " OR ";
    const nestedRules = ruleOrGroup.rules.map((rule) => buildRuleSql(rule));
    return Prisma.sql`(${Prisma.join(nestedRules, nestedJoiner)})`;
  });

  return Prisma.sql`(${Prisma.join(parts, joiner)})`;
}

function buildWhereSql(params: {
  orgId: string;
  from: Date;
  to: Date;
  segmentDsl?: SegmentDslInput;
}): Prisma.Sql {
  const predicates: Prisma.Sql[] = [
    Prisma.sql`"orgId" = ${params.orgId}`,
    Prisma.sql`"timestamp" >= ${params.from}`,
    Prisma.sql`"timestamp" <= ${params.to}`,
  ];

  if (params.segmentDsl) {
    predicates.push(buildSegmentSql(params.segmentDsl));
  }

  return Prisma.join(predicates, " AND ");
}

function getOrderBy(
  rows: DimensionKey[],
  metrics: MetricKey[],
  sort?: { key: string; direction: SortDirection },
): Prisma.Sql {
  const aliasByKey = new Map<string, string>();
  rows.forEach((key, index) => aliasByKey.set(key, `d${index}`));
  metrics.forEach((key, index) => aliasByKey.set(key, `m${index}`));

  const sortKey = sort?.key ?? metrics[0];
  const alias = aliasByKey.get(sortKey);
  if (!alias) {
    throw new Error(`Invalid sort key: ${sortKey}`);
  }

  const direction = (sort?.direction ?? "desc").toUpperCase();
  const safeDirection = direction === "ASC" ? "ASC" : "DESC";
  return Prisma.sql`ORDER BY ${Prisma.raw(`"${alias}"`)} ${Prisma.raw(safeDirection)}`;
}

async function runTableQueryInMemory(input: QueryTableInput): Promise<{
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
  totals: Record<string, number>;
}> {
  const from = parseDate(input.dateRange.from, "start");
  const to = parseDate(input.dateRange.to, "end");

  const eventsRaw = (await prisma.event.findMany({
    where: {
      orgId: input.orgId,
      timestamp: {
        gte: from,
        lte: to,
      },
    },
    select: {
      eventName: true,
      timestamp: true,
      userId: true,
      properties: true,
    },
  })) as EventSnapshot[];

  const events = eventsRaw.filter((event) =>
    matchesSegmentDsl(event, input.segmentDsl),
  );

  type Bucket = {
    dimensions: Record<string, string>;
    events: number;
    revenue: number;
    netDemand: number;
    users: Set<string>;
  };

  const buckets = new Map<string, Bucket>();
  for (const event of events) {
    const dimensions: Record<string, string> = {};
    for (const dimension of input.rows) {
      dimensions[dimension] = readDimensionFromEvent(event, dimension);
    }

    const key = input.rows.map((dimension) => dimensions[dimension] ?? "").join("|");
    const bucket =
      buckets.get(key) ??
      ({
        dimensions,
        events: 0,
        revenue: 0,
        netDemand: 0,
        users: new Set<string>(),
      } satisfies Bucket);

    bucket.events += 1;
    bucket.revenue += readRevenue(event);
    bucket.netDemand += readNetDemand(event);
    if (event.userId) {
      bucket.users.add(event.userId);
    }

    buckets.set(key, bucket);
  }

  const rows = Array.from(buckets.values()).map((bucket) => {
    const row: Record<string, string | number | null> = {};
    for (const dimension of input.rows) {
      row[dimension] = bucket.dimensions[dimension] ?? "(none)";
    }
    for (const metric of input.metrics) {
      if (metric === "events") {
        row[metric] = bucket.events;
      } else if (metric === "users") {
        row[metric] = bucket.users.size;
      } else if (metric === "revenue") {
        row[metric] = bucket.revenue;
      } else {
        row[metric] = bucket.netDemand;
      }
    }
    return row;
  });

  const sortKey = input.sort?.key ?? input.metrics[0];
  const direction = input.sort?.direction ?? "desc";
  if (sortKey) {
    rows.sort((left, right) => {
      const a = left[sortKey] ?? 0;
      const b = right[sortKey] ?? 0;
      const leftValue = typeof a === "number" ? a : String(a);
      const rightValue = typeof b === "number" ? b : String(b);
      if (leftValue === rightValue) {
        return 0;
      }

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return direction === "asc"
          ? leftValue - rightValue
          : rightValue - leftValue;
      }

      return direction === "asc"
        ? String(leftValue).localeCompare(String(rightValue))
        : String(rightValue).localeCompare(String(leftValue));
    });
  }

  const limit = input.limit ?? 100;
  const limitedRows = rows.slice(0, limit);

  const userTotals = new Set<string>();
  const totals: Record<string, number> = {};
  for (const event of events) {
    if (event.userId) {
      userTotals.add(event.userId);
    }
  }
  for (const metric of input.metrics) {
    if (metric === "events") {
      totals[metric] = events.length;
    } else if (metric === "users") {
      totals[metric] = userTotals.size;
    } else if (metric === "revenue") {
      totals[metric] = events.reduce(
        (sum, event) => sum + readRevenue(event),
        0,
      );
    } else {
      totals[metric] = events.reduce(
        (sum, event) => sum + readNetDemand(event),
        0,
      );
    }
  }

  return {
    columns: [...input.rows, ...input.metrics],
    rows: limitedRows,
    totals,
  };
}

async function runTimeseriesQueryInMemory(input: QueryTimeseriesInput): Promise<{
  series: Array<{ bucket: string; dimension?: string | null; value: number }>;
}> {
  const from = parseDate(input.dateRange.from, "start");
  const to = parseDate(input.dateRange.to, "end");

  const eventsRaw = (await prisma.event.findMany({
    where: {
      orgId: input.orgId,
      timestamp: {
        gte: from,
        lte: to,
      },
    },
    select: {
      eventName: true,
      timestamp: true,
      userId: true,
      properties: true,
    },
  })) as EventSnapshot[];

  const events = eventsRaw.filter((event) =>
    matchesSegmentDsl(event, input.segmentDsl),
  );

  type Bucket = {
    bucket: string;
    dimension: string | null;
    events: number;
    revenue: number;
    netDemand: number;
    users: Set<string>;
  };

  const buckets = new Map<string, Bucket>();
  for (const event of events) {
    const bucket =
      input.granularity === "day"
        ? formatDay(event.timestamp)
        : formatHour(event.timestamp);
    const dimension = input.dimensionKey
      ? readDimensionFromEvent(event, input.dimensionKey)
      : null;
    const key = `${bucket}|${dimension ?? ""}`;

    const entry =
      buckets.get(key) ??
      ({
        bucket,
        dimension,
        events: 0,
        revenue: 0,
        netDemand: 0,
        users: new Set<string>(),
      } satisfies Bucket);

    entry.events += 1;
    entry.revenue += readRevenue(event);
    entry.netDemand += readNetDemand(event);
    if (event.userId) {
      entry.users.add(event.userId);
    }
    buckets.set(key, entry);
  }

  const series = Array.from(buckets.values())
    .map((entry) => ({
      bucket: entry.bucket,
      ...(input.dimensionKey ? { dimension: entry.dimension } : {}),
      value:
        input.metricKey === "events"
          ? entry.events
          : input.metricKey === "users"
            ? entry.users.size
            : input.metricKey === "revenue"
              ? entry.revenue
              : entry.netDemand,
    }))
    .sort((left, right) => left.bucket.localeCompare(right.bucket));

  return { series };
}

export async function runTableQuery(input: QueryTableInput): Promise<{
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
  totals: Record<string, number>;
}> {
  if (typeof (prisma as { $queryRaw?: unknown }).$queryRaw !== "function") {
    return runTableQueryInMemory(input);
  }

  const from = parseDate(input.dateRange.from, "start");
  const to = parseDate(input.dateRange.to, "end");
  const whereSql = buildWhereSql({
    orgId: input.orgId,
    from,
    to,
    segmentDsl: input.segmentDsl,
  });

  const dimensionSelects = input.rows.map((dimension, index) => ({
    key: dimension,
    alias: `d${index}`,
    expr: getDimensionExpr(dimension),
  }));
  const metricSelects = input.metrics.map((metric, index) => ({
    key: metric,
    alias: `m${index}`,
    expr: getMetricExpr(metric),
  }));

  const selectSql = Prisma.join(
    [
      ...dimensionSelects.map(
        (dimension) =>
          Prisma.sql`${dimension.expr} AS ${Prisma.raw(`"${dimension.alias}"`)}`,
      ),
      ...metricSelects.map(
        (metric) =>
          Prisma.sql`${metric.expr} AS ${Prisma.raw(`"${metric.alias}"`)}`,
      ),
    ],
    ", ",
  );

  const groupBySql = dimensionSelects.length
    ? Prisma.sql`GROUP BY ${Prisma.join(
        dimensionSelects.map((dimension) => dimension.expr),
        ", ",
      )}`
    : Prisma.empty;

  const orderBySql = getOrderBy(input.rows, input.metrics, input.sort);
  const limit = input.limit ?? 100;

  const rowsRaw = await prisma.$queryRaw<
    Array<Record<string, unknown>>
  >(Prisma.sql`
    SELECT ${selectSql}
    FROM "Event"
    WHERE ${whereSql}
    ${groupBySql}
    ${orderBySql}
    LIMIT ${limit}
  `);

  const totalsSelectSql = Prisma.join(
    metricSelects.map(
      (metric) =>
        Prisma.sql`${metric.expr} AS ${Prisma.raw(`"${metric.alias}"`)}`,
    ),
    ", ",
  );
  const totalsRaw = await prisma.$queryRaw<
    Array<Record<string, unknown>>
  >(Prisma.sql`
    SELECT ${totalsSelectSql}
    FROM "Event"
    WHERE ${whereSql}
  `);

  const rows = rowsRaw.map((row) => {
    const output: Record<string, string | number | null> = {};
    dimensionSelects.forEach((dimension) => {
      output[dimension.key] = (row[dimension.alias] as string | null) ?? null;
    });
    metricSelects.forEach((metric) => {
      output[metric.key] = toNumber(row[metric.alias]);
    });
    return output;
  });

  const totalsRow = totalsRaw[0] ?? {};
  const totals: Record<string, number> = {};
  metricSelects.forEach((metric) => {
    totals[metric.key] = toNumber(totalsRow[metric.alias]);
  });

  return {
    columns: [...input.rows, ...input.metrics],
    rows,
    totals,
  };
}

export async function runTimeseriesQuery(input: QueryTimeseriesInput): Promise<{
  series: Array<{ bucket: string; dimension?: string | null; value: number }>;
}> {
  if (typeof (prisma as { $queryRaw?: unknown }).$queryRaw !== "function") {
    return runTimeseriesQueryInMemory(input);
  }

  const from = parseDate(input.dateRange.from, "start");
  const to = parseDate(input.dateRange.to, "end");
  const whereSql = buildWhereSql({
    orgId: input.orgId,
    from,
    to,
    segmentDsl: input.segmentDsl,
  });

  const bucketExpr =
    input.granularity === "day" ? dayBucketExpr() : hourBucketExpr();
  const metricExpr = getMetricExpr(input.metricKey);
  const dimensionExpr = input.dimensionKey
    ? getDimensionExpr(input.dimensionKey)
    : null;

  const dimensionSelect = dimensionExpr
    ? Prisma.sql`, ${dimensionExpr} AS "dimension"`
    : Prisma.empty;
  const dimensionGroup = dimensionExpr
    ? Prisma.sql`, ${dimensionExpr}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<Record<string, unknown>>
  >(Prisma.sql`
    SELECT ${bucketExpr} AS "bucket"
    ${dimensionSelect},
    ${metricExpr} AS "value"
    FROM "Event"
    WHERE ${whereSql}
    GROUP BY ${bucketExpr}${dimensionGroup}
    ORDER BY "bucket" ASC
  `);

  return {
    series: rows.map((row) => ({
      bucket: String(row.bucket),
      ...(dimensionExpr
        ? { dimension: (row.dimension as string | null) ?? null }
        : {}),
      value: toNumber(row.value),
    })),
  };
}
