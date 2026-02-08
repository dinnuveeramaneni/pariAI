import { PrismaClient } from "@prisma/client";
import { createMemoryPrismaClient } from "@/lib/prisma-memory";

declare global {
  var prismaGlobal: PrismaClient | undefined;
  var prismaMemoryGlobal:
    | ReturnType<typeof createMemoryPrismaClient>
    | undefined;
}

const useMemory = process.env.E2E_TEST_MODE === "1";

const prismaClient =
  global.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prismaClient;
}

const prismaMemory = global.prismaMemoryGlobal ?? createMemoryPrismaClient();
if (process.env.NODE_ENV !== "production") {
  global.prismaMemoryGlobal = prismaMemory;
}

export const prisma = (useMemory
  ? prismaMemory
  : prismaClient) as unknown as PrismaClient;
