import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditInput = {
  orgId: string;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: unknown;
};

export async function writeAuditLog(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      ...(input.metadata === undefined
        ? {}
        : { metadata: input.metadata as Prisma.InputJsonValue }),
    },
  });
}
