import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiSecret } from "@/lib/api-key";

const findUnique = vi.fn();
const update = vi.fn();
const createMany = vi.fn();
const applyRateLimit = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: { findUnique, update },
    event: { createMany },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit,
}));

describe("ingest API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyRateLimit.mockReturnValue({ ok: true, remaining: 100 });
    createMany.mockResolvedValue({ count: 1 });
    update.mockResolvedValue({});
  });

  it("returns 401 if API key header is missing", async () => {
    const { POST } = await import("@/app/api/ingest/events/route");
    const request = new Request("http://localhost/api/ingest/events", {
      method: "POST",
      body: JSON.stringify({ events: [] }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("accepts valid events with valid API key", async () => {
    const key = "cja_abc12345_secret123";
    findUnique.mockResolvedValue({
      id: "key_1",
      orgId: "org_1",
      secretHash: hashApiSecret("secret123"),
      revokedAt: null,
    });

    const { POST } = await import("@/app/api/ingest/events/route");
    const request = new Request("http://localhost/api/ingest/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
      },
      body: JSON.stringify({
        events: [
          {
            eventId: "evt_1",
            eventName: "page_view",
            timestamp: "2026-02-07T10:00:00.000Z",
            userId: "u1",
            sessionId: "s1",
            properties: {
              country: "US",
              revenue: 0,
            },
          },
        ],
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      accepted: number;
      rejected: number;
    };
    expect(response.status).toBe(202);
    expect(payload.accepted).toBe(1);
    expect(payload.rejected).toBe(0);
    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it("rejects ingest when payload orgId mismatches api key orgId", async () => {
    const key = "cja_abc12345_secret123";
    findUnique.mockResolvedValue({
      id: "key_1",
      orgId: "org_a",
      secretHash: hashApiSecret("secret123"),
      revokedAt: null,
    });

    const { POST } = await import("@/app/api/ingest/events/route");
    const request = new Request("http://localhost/api/ingest/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
      },
      body: JSON.stringify({
        orgId: "org_b",
        events: [
          {
            eventId: "evt_2",
            eventName: "page_view",
            timestamp: "2026-02-07T10:00:00.000Z",
            userId: "u1",
            sessionId: "s1",
            properties: {
              country: "US",
              revenue: 0,
            },
          },
        ],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(createMany).not.toHaveBeenCalled();
  });
});
