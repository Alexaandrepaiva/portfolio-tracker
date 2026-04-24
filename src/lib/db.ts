import { PrismaClient } from "@prisma/client";
import { assertCriticalEnvVariables } from "@/lib/env";

declare global {
  var prismaClient: PrismaClient | undefined;
}

export function getDbClient(): PrismaClient {
  if (!global.prismaClient) {
    assertCriticalEnvVariables();
    global.prismaClient = new PrismaClient();
  }

  return global.prismaClient;
}
