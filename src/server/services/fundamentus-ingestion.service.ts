import { ApiError } from "@/server/http/api-error";
import { createFundamentusRunner } from "@/server/ingestion/fundamentus";
import { getFundamentusConfig } from "@/server/ingestion/fundamentus/config";
import type { CollectorMode } from "@/server/ingestion/fundamentus/types";

export async function runFundamentusIngestion(input: { mode: CollectorMode }) {
  const runner = createFundamentusRunner();
  return runner.run({ mode: input.mode });
}

export function assertIngestionSecret(params: {
  ingestionKeyHeader: string | null;
  authorizationHeader: string | null;
}): void {
  const config = getFundamentusConfig();

  if (!config.ingestionJobSecret || config.ingestionJobSecret.trim().length === 0) {
    throw new ApiError(500, "INGESTION_SECRET_NOT_CONFIGURED", "INGESTION_JOB_SECRET is not configured.");
  }

  const bearer = params.authorizationHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const valid = params.ingestionKeyHeader === config.ingestionJobSecret || bearer === config.ingestionJobSecret;

  if (!valid) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid ingestion key.");
  }
}
