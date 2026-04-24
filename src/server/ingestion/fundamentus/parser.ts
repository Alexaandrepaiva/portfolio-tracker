import { FundamentusParseError } from "@/server/ingestion/fundamentus/errors";
import type { ParsedFactRow } from "@/server/ingestion/fundamentus/types";

const TICKER_REGEX = /(?:papel|ticker)=([A-Z0-9]{4,6}\d{0,2})/gi;
const DATE_REGEX = /(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/;

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(baseUrl: string, value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = value.startsWith("/") ? value : `/${value}`;

  return `${normalizedBase}${normalizedPath}`;
}

export function parseTickersFromDiscoveryHtml(html: string): string[] {
  const unique = new Set<string>();

  for (const match of html.matchAll(TICKER_REGEX)) {
    const ticker = match[1]?.toUpperCase();
    if (ticker) {
      unique.add(ticker);
    }
  }

  return [...unique].sort((a, b) => a.localeCompare(b));
}

export function parseFactsFromTickerHtml(params: {
  html: string;
  baseUrl: string;
}): ParsedFactRow[] {
  const rows = params.html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const parsedRows: ParsedFactRow[] = [];

  for (const row of rows) {
    const dateMatch = row.match(DATE_REGEX);
    const hrefMatch = row.match(/href=["']([^"']+)["']/i);
    const anchorMatch = row.match(/<a[^>]*>([\s\S]*?)<\/a>/i);

    if (!dateMatch || !hrefMatch || !anchorMatch) {
      continue;
    }

    const title = stripHtml(anchorMatch[1]);
    if (title.length === 0) {
      continue;
    }

    const sourceUrl = normalizeUrl(params.baseUrl, hrefMatch[1]);

    parsedRows.push({
      title,
      sourceUrl,
      publishedAtRaw: dateMatch[1],
    });
  }

  if (parsedRows.length === 0 && /fato/i.test(params.html)) {
    throw new FundamentusParseError("Unable to parse relevant facts rows from ticker page.");
  }

  return parsedRows;
}

export function hasNextPageInTickerHtml(params: {
  html: string;
  ticker: string;
  currentPage: number;
}): boolean {
  const nextPage = params.currentPage + 1;
  const escapedTicker = params.ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextPageRegex = new RegExp(
    `fatos_relevantes\\.php\\?papel=${escapedTicker}(?:&amp;|&)pg=${nextPage}`,
    "i",
  );

  return nextPageRegex.test(params.html);
}
