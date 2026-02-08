import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRawMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

function sqlText(sqlArg: unknown): string {
  const candidate = sqlArg as { strings?: string[]; sql?: string };
  if (typeof candidate.sql === "string") {
    return candidate.sql;
  }
  if (Array.isArray(candidate.strings)) {
    return candidate.strings.join("?");
  }
  return String(sqlArg);
}

function sqlValues(sqlArg: unknown): unknown[] {
  const candidate = sqlArg as { values?: unknown[] };
  return Array.isArray(candidate.values) ? candidate.values : [];
}

describe("SQL query engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns mapped table aggregations and totals", async () => {
    queryRawMock
      .mockResolvedValueOnce([
        { d0: "paid", m0: "3", m1: "2", m2: "120.5" },
        { d0: "organic", m0: "2", m1: "1", m2: "10.0" },
      ])
      .mockResolvedValueOnce([{ m0: "5", m1: "3", m2: "130.5" }]);

    const { runTableQuery } = await import("@/lib/query-engine-sql");
    const result = await runTableQuery({
      orgId: "org_a",
      dateRange: { from: "2026-02-01", to: "2026-02-28" },
      rows: ["channel"],
      metrics: ["events", "users", "revenue"],
      limit: 50,
      sort: { key: "events", direction: "desc" },
    });

    expect(result.columns).toEqual(["channel", "events", "users", "revenue"]);
    expect(result.rows[0]).toEqual({
      channel: "paid",
      events: 3,
      users: 2,
      revenue: 120.5,
    });
    expect(result.totals).toEqual({
      events: 5,
      users: 3,
      revenue: 130.5,
    });
  });

  it("applies segment DSL into WHERE clauses", async () => {
    queryRawMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ m0: "0" }]);

    const { runTableQuery } = await import("@/lib/query-engine-sql");
    await runTableQuery({
      orgId: "org_a",
      dateRange: { from: "2026-02-01", to: "2026-02-28" },
      rows: ["eventName"],
      metrics: ["events"],
      limit: 20,
      segmentDsl: {
        op: "AND",
        rules: [
          { field: "eventName", op: "contains", value: "purchase" },
          {
            op: "OR",
            rules: [
              { field: "channel", op: "eq", value: "paid" },
              { field: "channel", op: "eq", value: "organic" },
            ],
          },
        ],
      },
    });

    const firstSql = queryRawMock.mock.calls[0][0];
    const text = sqlText(firstSql);
    const values = sqlValues(firstSql);

    expect(text).toContain("ILIKE");
    expect(text).toContain(" OR ");
    expect(values).toContain("%purchase%");
    expect(values).toContain("paid");
    expect(values).toContain("organic");
  });

  it("applies sort and limit in SQL", async () => {
    queryRawMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ m0: "0" }]);

    const { runTableQuery } = await import("@/lib/query-engine-sql");
    await runTableQuery({
      orgId: "org_a",
      dateRange: {
        from: "2026-02-01T00:00:00.000Z",
        to: "2026-02-28T23:59:59.999Z",
      },
      rows: ["campaign"],
      metrics: ["events"],
      sort: { key: "events", direction: "desc" },
      limit: 10,
    });

    const firstSql = queryRawMock.mock.calls[0][0];
    const text = sqlText(firstSql);
    const values = sqlValues(firstSql);

    expect(text).toContain('ORDER BY "m0" DESC');
    expect(text).toContain("LIMIT");
    expect(values).toContain(10);
  });

  it("supports brand dimension SQL mapping", async () => {
    queryRawMock
      .mockResolvedValueOnce([{ d0: "Gap", m0: "4" }])
      .mockResolvedValueOnce([{ m0: "4" }]);

    const { runTableQuery } = await import("@/lib/query-engine-sql");
    await runTableQuery({
      orgId: "org_a",
      dateRange: { from: "2026-02-01", to: "2026-02-28" },
      rows: ["brand"],
      metrics: ["events"],
      limit: 25,
    });

    const firstSql = queryRawMock.mock.calls[0][0];
    const text = sqlText(firstSql);

    expect(text).toContain(`"properties"->>'brand'`);
  });

  it("supports net demand metric SQL mapping", async () => {
    queryRawMock
      .mockResolvedValueOnce([{ d0: "Gap", m0: "88.5" }])
      .mockResolvedValueOnce([{ m0: "88.5" }]);

    const { runTableQuery } = await import("@/lib/query-engine-sql");
    const result = await runTableQuery({
      orgId: "org_a",
      dateRange: { from: "2026-02-01", to: "2026-02-28" },
      rows: ["brand"],
      metrics: ["netDemand"],
      limit: 25,
    });

    const firstSql = queryRawMock.mock.calls[0][0];
    const text = sqlText(firstSql);

    expect(text).toContain(`"properties"->>'netDemand'`);
    expect(result.columns).toEqual(["brand", "netDemand"]);
    expect(result.rows[0]?.netDemand).toBe(88.5);
    expect(result.totals.netDemand).toBe(88.5);
  });
});
