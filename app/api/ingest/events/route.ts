import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestEventsSchema } from "@/lib/validators";
import { applyRateLimit } from "@/lib/rate-limit";
import { parseApiKey, verifyApiKey } from "@/lib/api-key";
import { ensureOrgIdMatch } from "@/lib/api-helpers";

export async function POST(request: Request) {
  const rawKey = request.headers.get("x-api-key");
  if (!rawKey) {
    return NextResponse.json(
      { error: "Missing X-API-Key header" },
      { status: 401 },
    );
  }

  const parsedKey = parseApiKey(rawKey);
  if (!parsedKey) {
    return NextResponse.json(
      { error: "Invalid API key format" },
      { status: 401 },
    );
  }

  const keyRecord = await prisma.apiKey.findUnique({
    where: { prefix: parsedKey.prefix },
    select: {
      id: true,
      orgId: true,
      secretHash: true,
      revokedAt: true,
    },
  });

  if (!keyRecord || keyRecord.revokedAt) {
    return NextResponse.json(
      { error: "API key invalid or revoked" },
      { status: 401 },
    );
  }

  if (!verifyApiKey(rawKey, keyRecord.secretHash)) {
    return NextResponse.json(
      { error: "API key invalid or revoked" },
      { status: 401 },
    );
  }

  const rate = applyRateLimit(keyRecord.id);
  if (!rate.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ingestEventsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const orgMatch = ensureOrgIdMatch(keyRecord.orgId, parsed.data.orgId);
  if (!orgMatch.ok) {
    return orgMatch.error;
  }

  const result = await prisma.event.createMany({
    data: parsed.data.events.map((event) => ({
      orgId: keyRecord.orgId,
      eventId: event.eventId,
      eventName: event.eventName,
      timestamp: new Date(event.timestamp),
      userId: event.userId ?? null,
      sessionId: event.sessionId ?? null,
      properties: event.properties,
    })),
    skipDuplicates: true,
  });

  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  return NextResponse.json(
    {
      accepted: result.count,
      rejected: parsed.data.events.length - result.count,
      total: parsed.data.events.length,
    },
    { status: 202 },
  );
}
