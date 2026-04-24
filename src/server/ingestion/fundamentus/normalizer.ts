import crypto from "node:crypto";
import type { AssetType } from "@prisma/client";
import type { NormalizedFactRow, ParsedFactRow } from "@/server/ingestion/fundamentus/types";

function normalizeTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeFundamentusDate(rawValue: string): Date {
  const [datePart, timePart] = rawValue.trim().split(/\s+/);
  const [day, month, year] = datePart.split("/").map((part) => Number.parseInt(part, 10));

  const hourMinute = timePart ? timePart.split(":") : ["00", "00"];
  const hours = Number.parseInt(hourMinute[0], 10);
  const minutes = Number.parseInt(hourMinute[1], 10);

  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Fundamentus date value: ${rawValue}`);
  }

  return date;
}

export function buildExternalSourceId(params: {
  ticker: string;
  publishedAt: Date;
  title: string;
  sourceUrl: string;
}): string {
  const normalizedTitle = normalizeTitle(params.title);
  const payload = [
    "source=fundamentus",
    `ticker=${params.ticker.toUpperCase()}`,
    `publishedAt=${params.publishedAt.toISOString()}`,
    `title=${normalizedTitle}`,
    `sourceUrl=${params.sourceUrl}`,
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function normalizeFactRow(params: {
  ticker: string;
  row: ParsedFactRow;
}): NormalizedFactRow {
  const publishedAt = normalizeFundamentusDate(params.row.publishedAtRaw);
  const normalizedTitle = normalizeTitle(params.row.title);

  return {
    title: params.row.title.trim(),
    normalizedTitle,
    sourceUrl: params.row.sourceUrl,
    publishedAt,
    externalSourceId: buildExternalSourceId({
      ticker: params.ticker,
      publishedAt,
      title: params.row.title,
      sourceUrl: params.row.sourceUrl,
    }),
  };
}

export function inferAssetTypeFromTicker(params: {
  ticker: string;
  actionsSuffix11Exceptions: string[];
}): AssetType {
  const tickerUpper = params.ticker.toUpperCase();
  const exceptions = new Set(params.actionsSuffix11Exceptions.map((value) => value.toUpperCase()));

  if (tickerUpper.endsWith("11") && !exceptions.has(tickerUpper)) {
    return "FII";
  }

  return "STOCK";
}
