import { z } from "zod";
import { SEMANTIC_DIMENSIONS, SEMANTIC_METRICS } from "@/lib/semantic-layer";

export const registerSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(8),
  name: z.string().trim().min(2).max(100).optional(),
});

export const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export const inviteSchema = z.object({
  orgId: z.string().min(1).optional(),
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
});

export const updateMemberSchema = z.object({
  orgId: z.string().min(1).optional(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]),
});

export const createApiKeySchema = z.object({
  orgId: z.string().min(1).optional(),
  name: z.string().trim().min(2).max(120),
});

export const createProjectSchema = z.object({
  orgId: z.string().min(1).optional(),
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(500).optional(),
});

export const saveProjectVersionSchema = z.object({
  orgId: z.string().min(1).optional(),
  schemaVersion: z.number().int().positive(),
  payload: z.unknown(),
});

const segmentRuleSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["eq", "neq", "contains", "gt", "gte", "lt", "lte", "in"]),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ]),
});

const nestedSegmentGroupSchema = z.object({
  op: z.enum(["AND", "OR"]),
  rules: z.array(segmentRuleSchema).min(1),
});

const dateOrDateTimeSchema = z.string().refine((value) => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const dateTime = /^\d{4}-\d{2}-\d{2}T/.test(value);
  return dateOnly || dateTime;
}, "Invalid date format");

export const segmentDslSchema = z.object({
  op: z.enum(["AND", "OR"]),
  rules: z.array(z.union([segmentRuleSchema, nestedSegmentGroupSchema])).min(1),
});

const freeformSegmentRuleSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["eq", "neq", "contains"]),
  value: z.string(),
});

const freeformSegmentGroupSchema = z.object({
  op: z.enum(["AND", "OR"]),
  rules: z.array(freeformSegmentRuleSchema).min(1),
});

export const freeformQuerySchema = z.object({
  orgId: z.string().min(1).optional(),
  rows: z.array(z.string()).default([]),
  columns: z.array(z.string()).min(1),
  segments: z.array(freeformSegmentGroupSchema).default([]),
  dateRange: z.union([
    z.object({
      type: z.literal("preset"),
      value: z.enum(["last_7_days", "last_30_days"]),
    }),
    z.object({
      type: z.literal("custom"),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  ]),
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).default(0),
  sort: z
    .array(
      z.object({
        column: z.string(),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .default([]),
});

const ingestEventSchema = z.object({
  eventId: z.string().min(1),
  eventName: z.string().min(1).max(120),
  timestamp: z.string().datetime(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  properties: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
});

export const ingestEventsSchema = z.object({
  orgId: z.string().min(1).optional(),
  events: z.array(ingestEventSchema).min(1).max(500),
});

export const queryTableSchema = z.object({
  orgId: z.string().min(1),
  dateRange: z.object({
    from: dateOrDateTimeSchema,
    to: dateOrDateTimeSchema,
  }),
  rows: z.array(z.enum(SEMANTIC_DIMENSIONS)).default([]),
  metrics: z.array(z.enum(SEMANTIC_METRICS)).min(1),
  segmentDsl: segmentDslSchema.optional(),
  sort: z
    .object({
      key: z.string().min(1),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
  limit: z.number().int().min(1).max(1000).default(100),
});

export const queryTimeseriesSchema = z.object({
  orgId: z.string().min(1),
  metricKey: z.enum(SEMANTIC_METRICS),
  dimensionKey: z.enum(SEMANTIC_DIMENSIONS).optional(),
  granularity: z.enum(["day", "hour"]),
  dateRange: z.object({
    from: dateOrDateTimeSchema,
    to: dateOrDateTimeSchema,
  }),
  segmentDsl: segmentDslSchema.optional(),
});

export type IngestEventInput = z.infer<typeof ingestEventSchema>;
export type FreeformQueryInput = z.infer<typeof freeformQuerySchema>;
export type QueryTableInput = z.infer<typeof queryTableSchema>;
export type QueryTimeseriesInput = z.infer<typeof queryTimeseriesSchema>;
export type SegmentDslInput = z.infer<typeof segmentDslSchema>;
