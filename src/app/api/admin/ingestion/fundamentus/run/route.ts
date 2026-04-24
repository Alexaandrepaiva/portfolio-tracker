import { NextRequest, NextResponse } from "next/server";
import { buildApiErrorResponse } from "@/server/http/api-error";
import type { FundamentusRunResponse } from "@/server/http/contracts";
import { runFundamentusIngestion, assertIngestionSecret } from "@/server/services/fundamentus-ingestion.service";
import type { CollectorMode } from "@/server/ingestion/fundamentus/types";

function parseMode(value: unknown): CollectorMode {
  if (value === "bootstrap") {
    return "bootstrap";
  }

  return "incremental";
}

async function run(request: NextRequest, modeInput: unknown) {
  assertIngestionSecret({
    ingestionKeyHeader: request.headers.get("x-ingestion-key"),
    authorizationHeader: request.headers.get("authorization"),
  });

  const mode = parseMode(modeInput);
  const result = await runFundamentusIngestion({ mode });

  const response: FundamentusRunResponse = {
    runId: result.runId,
    mode: result.mode,
    status: "completed",
    stats: result.stats,
  };

  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}));
    return await run(request, payload?.mode);
  } catch (error: unknown) {
    return buildApiErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get("mode");
    return await run(request, mode);
  } catch (error: unknown) {
    return buildApiErrorResponse(error);
  }
}
