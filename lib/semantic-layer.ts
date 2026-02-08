export const SEMANTIC_DIMENSIONS = [
  "channel",
  "brand",
  "product",
  "campaign",
  "eventName",
  "day",
] as const;

export const SEMANTIC_METRICS = [
  "events",
  "users",
  "revenue",
  "netDemand",
] as const;

export type DimensionKey = (typeof SEMANTIC_DIMENSIONS)[number];
export type MetricKey = (typeof SEMANTIC_METRICS)[number];
