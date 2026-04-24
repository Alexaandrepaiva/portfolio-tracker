import path from "node:path";

const DEFAULT_SUFFIX_11_EXCEPTIONS = [
  "TAEE11",
  "BRBI11",
  "SAPR11",
  "SANB11",
  "KLBN11",
  "IGTI11",
  "ENGI11",
  "BPAC11",
  "ALUP11",
] as const;

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

function parseCsv(value: string | undefined, fallback: readonly string[]): string[] {
  if (!value || value.trim().length === 0) {
    return [...fallback];
  }

  return value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item.length > 0);
}

export function getFundamentusConfig() {
  return {
    baseUrl: process.env.FUNDAMENTUS_BASE_URL ?? "https://www.fundamentus.com.br",
    storageStatePath:
      process.env.FUNDAMENTUS_STORAGE_STATE_PATH ??
      path.resolve(process.cwd(), ".cache", "fundamentus", "storage-state.json"),
    requestTimeoutMs: parseInteger(process.env.FUNDAMENTUS_REQUEST_TIMEOUT_MS, 30_000),
    rateLimitMs: parseInteger(process.env.FUNDAMENTUS_RATE_LIMIT_MS, 350),
    bootstrapDays: parseInteger(process.env.FUNDAMENTUS_BOOTSTRAP_DAYS, 30),
    bootstrapDocLimit: parseInteger(process.env.FUNDAMENTUS_BOOTSTRAP_DOC_LIMIT, 100),
    actionsSuffix11Exceptions: parseCsv(
      process.env.FUNDAMENTUS_ACTIONS_SUFFIX11_EXCEPTIONS,
      DEFAULT_SUFFIX_11_EXCEPTIONS,
    ),
    ingestionJobSecret: process.env.INGESTION_JOB_SECRET ?? "",
  };
}

export type FundamentusConfig = ReturnType<typeof getFundamentusConfig>;
