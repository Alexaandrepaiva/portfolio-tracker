import type { HealthResponse } from "@/server/http/contracts";
import { checkDatabaseConnection } from "@/server/repositories/health.repository";

export async function getHealthStatus(): Promise<HealthResponse> {
  const db = await checkDatabaseConnection();

  return {
    status: "ok",
    db,
  };
}
