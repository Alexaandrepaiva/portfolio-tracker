import fs from "node:fs";
import { chromium, type BrowserContext } from "playwright";
import { FundamentusSessionError } from "@/server/ingestion/fundamentus/errors";
import {
  hasNextPageInTickerHtml,
  parseFactsFromTickerHtml,
  parseTickersFromDiscoveryHtml,
} from "@/server/ingestion/fundamentus/parser";
import type { FundamentusConfig } from "@/server/ingestion/fundamentus/config";
import type { ParsedFactRow, TickerFactsPage } from "@/server/ingestion/fundamentus/types";

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assertSessionFile(path: string) {
  if (!fs.existsSync(path)) {
    throw new FundamentusSessionError(
      `Fundamentus storageState not found at ${path}. Run ingest:fundamentus:auth first.`,
    );
  }
}

function assertNotBlocked(html: string) {
  const blocked =
    /403 Forbidden/i.test(html) ||
    /Access to this resource on the server is denied/i.test(html) ||
    /challenge-platform/i.test(html);

  if (blocked) {
    throw new FundamentusSessionError(
      "Fundamentus anti-bot challenge is still active for current session. Renew storageState.",
    );
  }
}

export class FundamentusClient {
  constructor(private readonly config: FundamentusConfig) {}

  async discoverTickers(): Promise<string[]> {
    const html = await this.fetchHtml({
      url: `${this.config.baseUrl}/fr.php`,
      requireSession: true,
    });

    const tickers = parseTickersFromDiscoveryHtml(html);
    if (tickers.length === 0) {
      throw new Error("Ticker discovery returned zero tickers from Fundamentus.");
    }

    return tickers;
  }

  async fetchTickerFactsPage(params: { ticker: string; page: number }): Promise<TickerFactsPage> {
    const html = await this.fetchHtml({
      url: `${this.config.baseUrl}/fatos_relevantes.php?papel=${params.ticker}&pg=${params.page}`,
      requireSession: true,
    });

    const items: ParsedFactRow[] = parseFactsFromTickerHtml({
      html,
      baseUrl: this.config.baseUrl,
    });

    return {
      ticker: params.ticker,
      page: params.page,
      items,
      hasNextPage: hasNextPageInTickerHtml({
        html,
        ticker: params.ticker,
        currentPage: params.page,
      }),
    };
  }

  private async buildContext(requireSession: boolean): Promise<{
    context: BrowserContext;
    close: () => Promise<void>;
  }> {
    if (requireSession) {
      assertSessionFile(this.config.storageStatePath);
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(
      requireSession
        ? {
            storageState: this.config.storageStatePath,
          }
        : undefined,
    );

    return {
      context,
      close: async () => {
        await context.close();
        await browser.close();
      },
    };
  }

  private async fetchHtml(params: { url: string; requireSession: boolean }): Promise<string> {
    const runtime = await this.buildContext(params.requireSession);

    try {
      const page = await runtime.context.newPage();
      await page.goto(params.url, {
        timeout: this.config.requestTimeoutMs,
        waitUntil: "domcontentloaded",
      });

      const html = await page.content();
      assertNotBlocked(html);

      await sleep(this.config.rateLimitMs);
      return html;
    } finally {
      await runtime.close();
    }
  }
}
