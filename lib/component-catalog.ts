import { ComponentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type SeedComponent = {
  type: ComponentType;
  key: string;
  label: string;
  definition: Prisma.JsonObject;
};

const BASE_COMPONENTS: SeedComponent[] = [
  {
    type: ComponentType.DIMENSION,
    key: "channel",
    label: "Channel",
    definition: { source: "properties.channel" },
  },
  {
    type: ComponentType.DIMENSION,
    key: "brand",
    label: "Brand",
    definition: { source: "properties.brand" },
  },
  {
    type: ComponentType.DIMENSION,
    key: "product",
    label: "Product",
    definition: { source: "properties.product" },
  },
  {
    type: ComponentType.DIMENSION,
    key: "campaign",
    label: "Campaign",
    definition: { source: "properties.campaign" },
  },
  {
    type: ComponentType.DIMENSION,
    key: "day",
    label: "Day",
    definition: { source: "timestamp", granularity: "day" },
  },
  {
    type: ComponentType.METRIC,
    key: "events",
    label: "Events",
    definition: { aggregator: "count" },
  },
  {
    type: ComponentType.METRIC,
    key: "users",
    label: "Users",
    definition: { aggregator: "unique", field: "userId" },
  },
  {
    type: ComponentType.METRIC,
    key: "revenue",
    label: "Revenue",
    definition: { aggregator: "sum", field: "properties.revenue" },
  },
  {
    type: ComponentType.METRIC,
    key: "netDemand",
    label: "Net Demand",
    definition: { aggregator: "sum", field: "properties.netDemand" },
  },
  {
    type: ComponentType.SEGMENT,
    key: "segment:purchases",
    label: "Purchase events",
    definition: {
      op: "AND",
      rules: [{ field: "eventName", operator: "eq", value: "purchase" }],
    },
  },
  {
    type: ComponentType.SEGMENT,
    key: "segment:page_views",
    label: "Page views",
    definition: {
      op: "AND",
      rules: [{ field: "eventName", operator: "eq", value: "page_view" }],
    },
  },
  {
    type: ComponentType.DATE_RANGE,
    key: "date:last_7_days",
    label: "Last 7 Days",
    definition: { preset: "last_7_days" },
  },
  {
    type: ComponentType.DATE_RANGE,
    key: "date:last_30_days",
    label: "Last 30 Days",
    definition: { preset: "last_30_days" },
  },
];

export async function ensureOrgComponents(orgId: string): Promise<void> {
  for (const component of BASE_COMPONENTS) {
    await prisma.component.upsert({
      where: {
        orgId_key: {
          orgId,
          key: component.key,
        },
      },
      update: {
        label: component.label,
        definition: component.definition,
        type: component.type,
      },
      create: {
        orgId,
        type: component.type,
        key: component.key,
        label: component.label,
        definition: component.definition,
      },
    });
  }
}
