import type { CollectorMode, RunStats } from "@/server/ingestion/fundamentus/types";

export type HealthResponse = {
  status: "ok";
  db: "up" | "down";
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export type FundamentusRunResponse = {
  runId: string;
  mode: CollectorMode;
  status: "started" | "completed";
  stats: RunStats;
};
