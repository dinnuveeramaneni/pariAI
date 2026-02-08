import { PrismaClient } from "@prisma/client";
import { createMemoryPrismaClient } from "@/lib/prisma-memory";

declare global {
  var prismaGlobal: PrismaClient | undefined;
  var prismaMemoryGlobal:
    | ReturnType<typeof createMemoryPrismaClient>
    | undefined;
}

const useMemory =
  process.env.E2E_TEST_MODE === "1" ||
  (process.env.NODE_ENV !== "production" && process.env.PRISMA_FORCE_DB !== "1");

const prismaClient = useMemory
  ? undefined
  : global.prismaGlobal ??
    new PrismaClient({
      log:
        process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });

if (!useMemory && process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prismaClient;
}

const prismaMemory = useMemory
  ? global.prismaMemoryGlobal ?? createMemoryPrismaClient()
  : undefined;
if (useMemory && process.env.NODE_ENV !== "production") {
  global.prismaMemoryGlobal = prismaMemory;
}

export const prisma = (useMemory
  ? prismaMemory!
  : prismaClient!) as unknown as PrismaClient;
