import { NextResponse } from "next/server";
import { buildApiErrorResponse } from "@/server/http/api-error";
import { getHealthStatus } from "@/server/services/health.service";

export async function GET() {
  try {
    const response = await getHealthStatus();
    return NextResponse.json(response);
  } catch (error: unknown) {
    return buildApiErrorResponse(error);
  }
}
