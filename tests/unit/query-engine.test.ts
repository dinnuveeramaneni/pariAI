import { describe, expect, it } from "vitest";
import {
  aggregateEvents,
  matchesSegments,
  resolveDateRange,
} from "@/lib/query-engine";
import type { FreeformQueryInput } from "@/lib/validators";

const baseQuery: FreeformQueryInput = {
  rows: ["dimension:country"],
  columns: ["metric:event_count"],
  segments: [],
  dateRange: { type: "preset", value: "last_30_days" },
  limit: 50,
  offset: 0,
  sort: [],
};

const events = [
  {
    eventName: "purchase",
    timestamp: new Date("2026-02-01T10:00:00.000Z"),
    userId: "u1",
    properties: { country: "US", revenue: 10, page: "/pricing" },
  },
  {
    eventName: "purchase",
    timestamp: new Date("2026-02-01T11:00:00.000Z"),
    userId: "u2",
    properties: { country: "US", revenue: 15, page: "/pricing" },
  },
  {
    eventName: "page_view",
    timestamp: new Date("2026-02-02T11:00:00.000Z"),
    userId: "u1",
    properties: { country: "CA", revenue: 0, page: "/home" },
  },
];

describe("query-engine aggregation", () => {
  it("aggregates event count by dimension", () => {
    const result = aggregateEvents(events, baseQuery);
    const us = result.rows.find((row) => row.dimension === "US");
    const ca = result.rows.find((row) => row.dimension === "CA");

    expect(us?.["metric:event_count"]).toBe(2);
    expect(ca?.["metric:event_count"]).toBe(1);
    expect(result.totals["metric:event_count"]).toBe(3);
  });

  it("aggregates unique users metric", () => {
    const result = aggregateEvents(events, {
      ...baseQuery,
      columns: ["metric:unique_users"],
    });
    const us = result.rows.find((row) => row.dimension === "US");
    expect(us?.["metric:unique_users"]).toBe(2);
  });

  it("aggregates revenue sum metric", () => {
    const result = aggregateEvents(events, {
      ...baseQuery,
      columns: ["metric:revenue_sum"],
    });
    const us = result.rows.find((row) => row.dimension === "US");
    expect(us?.["metric:revenue_sum"]).toBe(25);
  });

  it("matches AND/OR segment rules", () => {
    const segmentMatch = matchesSegments(events[0], [
      {
        op: "AND",
        rules: [{ field: "eventName", operator: "eq", value: "purchase" }],
      },
      {
        op: "OR",
        rules: [
          { field: "properties.page", operator: "eq", value: "/pricing" },
          { field: "properties.page", operator: "eq", value: "/checkout" },
        ],
      },
    ]);
    expect(segmentMatch).toBe(true);
  });

  it("resolves preset date range with from <= to", () => {
    const range = resolveDateRange({ type: "preset", value: "last_7_days" });
    expect(range.from.getTime()).toBeLessThanOrEqual(range.to.getTime());
  });
});
