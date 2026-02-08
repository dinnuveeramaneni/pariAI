import { prisma } from "@/lib/prisma";

const SAMPLE_CHANNELS = [
  "Paid Search",
  "Organic",
  "Email",
  "Direct",
  "Social",
] as const;
const SAMPLE_PRODUCTS = [
  "Denim Jacket",
  "Classic Tee",
  "Runner Shoes",
  "Canvas Tote",
] as const;
const SAMPLE_BRANDS = ["Gap", "Old Navy", "PariAI", "Banana Republic"] as const;
const SAMPLE_CAMPAIGNS = [
  "Spring Launch",
  "Weekend Flash",
  "Retention Push",
  "Brand Awareness",
] as const;

type SampleDataOptions = {
  days?: number;
  eventsPerDay?: number;
};

function buildSampleEvents(
  orgId: string,
  options?: SampleDataOptions,
): Array<{
  orgId: string;
  eventId: string;
  eventName: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  properties: {
    channel: string;
    brand: string;
    product: string;
    campaign: string;
    revenue: number;
    netDemand: number;
    country: string;
    page: string;
  };
}> {
  const days = options?.days ?? 21;
  const eventsPerDay = options?.eventsPerDay ?? 12;
  const now = new Date();
  const startOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const events: ReturnType<typeof buildSampleEvents> = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const dayStart = new Date(
      startOfTodayUtc.getTime() - dayOffset * 24 * 60 * 60 * 1000,
    );

    for (let slot = 0; slot < eventsPerDay; slot += 1) {
      const absoluteIndex = dayOffset * eventsPerDay + slot;
      const channel = SAMPLE_CHANNELS[absoluteIndex % SAMPLE_CHANNELS.length];
      const product = SAMPLE_PRODUCTS[(absoluteIndex + 1) % SAMPLE_PRODUCTS.length];
      const brand = SAMPLE_BRANDS[(absoluteIndex + 3) % SAMPLE_BRANDS.length];
      const campaign =
        SAMPLE_CAMPAIGNS[(absoluteIndex + 2) % SAMPLE_CAMPAIGNS.length];

      const eventName =
        slot % 5 === 0
          ? "purchase"
          : slot % 3 === 0
            ? "add_to_cart"
            : "page_view";
      const revenue =
        eventName === "purchase" ? 49 + (absoluteIndex % 6) * 18 : 0;
      const netDemand =
        eventName === "purchase" ? Math.round(revenue * 0.92) : 0;

      const hour = (slot * 2) % 24;
      const timestamp = new Date(dayStart);
      timestamp.setUTCHours(hour, (slot * 7) % 60, 0, 0);
      const dateKey = timestamp.toISOString().slice(0, 10);

      const country =
        channel === "Paid Search" || channel === "Direct" ? "US" : "CA";
      const page =
        product === "Runner Shoes"
          ? "/products/runner-shoes"
          : product === "Denim Jacket"
            ? "/products/denim-jacket"
            : "/home";

      events.push({
        orgId,
        eventId: `sample-semantic-v3-${dateKey}-${slot}`,
        eventName,
        timestamp,
        userId: `demo-user-${absoluteIndex % 35}`,
        sessionId: `demo-session-${absoluteIndex % 80}`,
        properties: {
          channel,
          brand,
          product,
          campaign,
          revenue,
          netDemand,
          country,
          page,
        },
      });
    }
  }

  return events;
}

export async function ensureOrgSampleEvents(
  orgId: string,
  options?: SampleDataOptions,
): Promise<void> {
  const events = buildSampleEvents(orgId, options);
  await prisma.event.createMany({
    data: events,
    skipDuplicates: true,
  });
}

export async function ensureSampleEventsForAllOrgs(
  options?: SampleDataOptions,
): Promise<void> {
  const runtimePrisma = prisma as unknown as {
    organization?: {
      findMany?: (args: { select: { id: true } }) => Promise<Array<{ id: string }>>;
    };
    organizationMember?: {
      findMany?: (args: { include: { org: true } }) => Promise<
        Array<{
          org?: { id: string } | null;
        }>
      >;
    };
  };

  const orgIds = new Set<string>();
  if (runtimePrisma.organization?.findMany) {
    const orgs = await runtimePrisma.organization.findMany({
      select: { id: true },
    });
    for (const org of orgs) {
      orgIds.add(org.id);
    }
  } else if (runtimePrisma.organizationMember?.findMany) {
    const memberships = await runtimePrisma.organizationMember.findMany({
      include: { org: true },
    });
    for (const membership of memberships) {
      if (membership.org?.id) {
        orgIds.add(membership.org.id);
      }
    }
  }

  for (const orgId of orgIds) {
    await ensureOrgSampleEvents(orgId, options);
  }
}
