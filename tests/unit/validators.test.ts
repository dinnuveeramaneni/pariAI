import { describe, expect, it } from "vitest";
import {
  freeformQuerySchema,
  ingestEventsSchema,
  registerSchema,
} from "@/lib/validators";

describe("validators", () => {
  it("validates registration payload", () => {
    const parsed = registerSchema.parse({
      email: "USER@EXAMPLE.COM",
      password: "Password123!",
      name: "User",
    });

    expect(parsed.email).toBe("user@example.com");
  });

  it("rejects freeform query without metric columns", () => {
    const result = freeformQuerySchema.safeParse({
      rows: ["dimension:eventName"],
      columns: [],
      segments: [],
      dateRange: { type: "preset", value: "last_7_days" },
      limit: 50,
      offset: 0,
      sort: [],
    });

    expect(result.success).toBe(false);
  });

  it("validates ingest event payload", () => {
    const result = ingestEventsSchema.safeParse({
      events: [
        {
          eventId: "event-1",
          eventName: "page_view",
          timestamp: "2026-02-07T10:00:00.000Z",
          userId: "u1",
          sessionId: "s1",
          properties: {
            country: "US",
            revenue: 10,
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
