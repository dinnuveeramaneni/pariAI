import { prisma } from "@/lib/prisma";
import type { FreeformQueryInput } from "@/lib/validators";

type QueryEvent = {
  eventName: string;
  timestamp: Date;
  userId: string | null;
  properties: Record<string, unknown>;
};

type AggregationRow = {
  key: string;
  dimension: string;
  metrics: Record<string, number>;
  uniqueUsers: Record<string, Set<string>>;
};

function startOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function resolveDateRange(input: FreeformQueryInput["dateRange"]): {
  from: Date;
  to: Date;
} {
  if (input.type === "custom") {
    const from = new Date(`${input.from}T00:00:00.000Z`);
    const to = new Date(`${input.to}T23:59:59.999Z`);
    return { from, to };
  }

  const today = startOfToday();
  const days = input.value === "last_7_days" ? 7 : 30;
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  const to = new Date();
  return { from, to };
}

export function getDimensionValue(
  event: QueryEvent,
  dimensionKey: string,
): string {
  if (dimensionKey === "dimension:eventName") {
    return event.eventName || "(none)";
  }

  if (dimensionKey.startsWith("dimension:")) {
    const field = dimensionKey.replace("dimension:", "");
    const value = event.properties[field];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return String(value);
    }
  }

  return "(none)";
}

function getRuleFieldValue(event: QueryEvent, field: string): string {
  if (field === "eventName") {
    return event.eventName;
  }

  if (field.startsWith("properties.")) {
    const prop = field.replace("properties.", "");
    return String(event.properties[prop] ?? "");
  }

  return "";
}

function matchesRule(
  event: QueryEvent,
  rule: FreeformQueryInput["segments"][number]["rules"][number],
): boolean {
  const value = getRuleFieldValue(event, rule.field);

  if (rule.operator === "eq") {
    return value === rule.value;
  }

  if (rule.operator === "neq") {
    return value !== rule.value;
  }

  return value.includes(rule.value);
}

export function matchesSegments(
  event: QueryEvent,
  segments: FreeformQueryInput["segments"],
): boolean {
  if (segments.length === 0) {
    return true;
  }

  return segments.every((group) => {
    const checks = group.rules.map((rule) => matchesRule(event, rule));
    if (group.op === "AND") {
      return checks.every(Boolean);
    }

    return checks.some(Boolean);
  });
}

function applyMetric(
  row: AggregationRow,
  event: QueryEvent,
  metric: string,
): void {
  if (metric === "metric:event_count") {
    row.metrics[metric] = (row.metrics[metric] ?? 0) + 1;
    return;
  }

  if (metric === "metric:unique_users") {
    if (!row.uniqueUsers[metric]) {
      row.uniqueUsers[metric] = new Set<string>();
    }
    if (event.userId) {
      row.uniqueUsers[metric].add(event.userId);
    }
    row.metrics[metric] = row.uniqueUsers[metric].size;
    return;
  }

  if (metric === "metric:revenue_sum") {
    const raw = event.properties.revenue;
    const value = typeof raw === "number" ? raw : Number(raw ?? 0);
    row.metrics[metric] =
      (row.metrics[metric] ?? 0) + (Number.isFinite(value) ? value : 0);
  }
}

export function aggregateEvents(
  events: QueryEvent[],
  query: FreeformQueryInput,
): {
  columns: string[];
  rows: Array<Record<string, string | number>>;
  totals: Record<string, number>;
} {
  const rowDimension = query.rows[0] ?? "dimension:eventName";
  const metrics = query.columns;
  const buckets = new Map<string, AggregationRow>();
  const totals: Record<string, number> = {};

  for (const event of events) {
    if (!matchesSegments(event, query.segments)) {
      continue;
    }

    const dimension = getDimensionValue(event, rowDimension);
    const key = dimension;
    const existing =
      buckets.get(key) ??
      ({
        key,
        dimension,
        metrics: {},
        uniqueUsers: {},
      } satisfies AggregationRow);

    for (const metric of metrics) {
      applyMetric(existing, event, metric);
    }
    buckets.set(key, existing);
  }

  const rows = Array.from(buckets.values()).map((row) => {
    const output: Record<string, string | number> = {
      dimension: row.dimension,
    };

    for (const metric of metrics) {
      const value = row.metrics[metric] ?? 0;
      output[metric] = value;
      totals[metric] = (totals[metric] ?? 0) + value;
    }
    return output;
  });

  return {
    columns: ["dimension", ...metrics],
    rows,
    totals,
  };
}

export async function runFreeformQuery(
  orgId: string,
  query: FreeformQueryInput,
): Promise<{
  columns: string[];
  rows: Array<Record<string, string | number>>;
  totals: Record<string, number>;
  queryMs: number;
}> {
  const started = Date.now();
  const { from, to } = resolveDateRange(query.dateRange);

  const events = await prisma.event.findMany({
    where: {
      orgId,
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
  });

  const normalized: QueryEvent[] = events.map((event) => ({
    eventName: event.eventName,
    timestamp: event.timestamp,
    userId: event.userId,
    properties: (event.properties ?? {}) as Record<string, unknown>,
  }));

  const aggregated = aggregateEvents(normalized, query);
  const sortRule = query.sort[0];

  if (sortRule) {
    aggregated.rows.sort((a, b) => {
      const left = a[sortRule.column] ?? 0;
      const right = b[sortRule.column] ?? 0;
      if (left === right) {
        return 0;
      }
      const leftNumber = typeof left === "number" ? left : Number(left);
      const rightNumber = typeof right === "number" ? right : Number(right);

      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return sortRule.direction === "asc"
          ? leftNumber - rightNumber
          : rightNumber - leftNumber;
      }

      return sortRule.direction === "asc"
        ? String(left).localeCompare(String(right))
        : String(right).localeCompare(String(left));
    });
  }

  const start = query.offset;
  const end = start + query.limit;
  const pagedRows = aggregated.rows.slice(start, end);

  return {
    columns: aggregated.columns,
    rows: pagedRows,
    totals: aggregated.totals,
    queryMs: Date.now() - started,
  };
}
