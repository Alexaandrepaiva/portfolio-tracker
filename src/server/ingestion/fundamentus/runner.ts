import { randomUUID } from "node:crypto";
import { getFundamentusConfig, type FundamentusConfig } from "@/server/ingestion/fundamentus/config";
import { FundamentusSessionError } from "@/server/ingestion/fundamentus/errors";
import { logFundamentus } from "@/server/ingestion/fundamentus/logger";
import { normalizeFactRow } from "@/server/ingestion/fundamentus/normalizer";
import {
  buildErrorDiscoveryCheckpointMetadata,
  buildErrorTickerCheckpointMetadata,
  buildSuccessDiscoveryCheckpointMetadata,
  buildSuccessTickerCheckpointMetadata,
  buildTickerCheckpointSource,
  PrismaFundamentusRepository,
  type FundamentusRepository,
} from "@/server/ingestion/fundamentus/repository";
import type { CollectorMode, RunResult, RunStats, RunnerInput, TickerRunStats } from "@/server/ingestion/fundamentus/types";
import { DISCOVERY_CHECKPOINT_SOURCE } from "@/server/ingestion/fundamentus/types";

type RunnerClient = {
  discoverTickers: () => Promise<string[]>;
  fetchTickerFactsPage: (params: { ticker: string; page: number }) => Promise<{
    items: Array<{ title: string; sourceUrl: string; publishedAtRaw: string }>;
    hasNextPage: boolean;
  }>;
};

export class FundamentusCollectorRunner {
  private readonly config: FundamentusConfig;
  private readonly repository: FundamentusRepository;
  private readonly client: RunnerClient;

  constructor(params: {
    config?: FundamentusConfig;
    repository?: FundamentusRepository;
    client: RunnerClient;
  }) {
    this.config = params.config ?? getFundamentusConfig();
    this.repository = params.repository ?? new PrismaFundamentusRepository(this.config);
    this.client = params.client;
  }

  async run(input: RunnerInput): Promise<RunResult> {
    const runId = randomUUID();
    const startedAt = new Date();
    const nowIso = startedAt.toISOString();

    logFundamentus("run_started", {
      runId,
      mode: input.mode,
      startedAt: nowIso,
    });

    const stats: RunStats = {
      tickersDiscovered: 0,
      tickersProcessed: 0,
      tickersFailed: 0,
      pagesVisited: 0,
      documentsFound: 0,
      documentsInserted: 0,
      documentsSkipped: 0,
      errors: 0,
      startedAt: nowIso,
      finishedAt: nowIso,
    };

    const tickerStats: TickerRunStats[] = [];

    const discoveryCheckpoint = await this.repository.getCheckpoint(DISCOVERY_CHECKPOINT_SOURCE);

    let tickers: string[];
    try {
      const discoveredTickers = await this.client.discoverTickers();
      const trackedTickers = await this.repository.listTrackedTickers();
      const trackedTickerSet = new Set(trackedTickers.map((ticker) => ticker.toUpperCase()));
      tickers = discoveredTickers.filter((ticker) => trackedTickerSet.has(ticker.toUpperCase()));
      stats.tickersDiscovered = tickers.length;

      await this.repository.upsertCheckpoint({
        source: DISCOVERY_CHECKPOINT_SOURCE,
        lastProcessedAt: new Date(),
        metadata: buildSuccessDiscoveryCheckpointMetadata({
          previous: discoveryCheckpoint?.metadata,
          nowIso,
          tickersDiscovered: tickers.length,
        }),
      });
    } catch (error: unknown) {
      await this.repository.upsertCheckpoint({
        source: DISCOVERY_CHECKPOINT_SOURCE,
        metadata: buildErrorDiscoveryCheckpointMetadata({
          previous: discoveryCheckpoint?.metadata,
          nowIso,
          errorCode: getErrorCode(error),
          errorMessage: getErrorMessage(error),
        }),
      });

      throw error;
    }

    const bootstrapCutoff = buildBootstrapCutoff(this.config.bootstrapDays);
    let globalInserted = 0;

    for (const ticker of tickers) {
      if (input.mode === "bootstrap" && globalInserted >= this.config.bootstrapDocLimit) {
        break;
      }

      const tickerStartedAt = Date.now();
      const tickerCheckpointSource = buildTickerCheckpointSource(ticker);
      const checkpoint = await this.repository.getCheckpoint(tickerCheckpointSource);

      const tickerRun: TickerRunStats = {
        ticker,
        pages: 0,
        documentsFound: 0,
        documentsInserted: 0,
        documentsSkipped: 0,
        errors: 0,
        durationMs: 0,
      };

      try {
        const tickerResult = await this.collectTicker({
          mode: input.mode,
          ticker,
          checkpoint,
          bootstrapCutoff,
          remainingBootstrapQuota: this.config.bootstrapDocLimit - globalInserted,
          runId,
        });

        tickerRun.pages = tickerResult.pages;
        tickerRun.documentsFound = tickerResult.documentsFound;
        tickerRun.documentsInserted = tickerResult.documentsInserted;
        tickerRun.documentsSkipped = tickerResult.documentsSkipped;
        tickerRun.errors = tickerResult.errors;
        tickerRun.durationMs = Date.now() - tickerStartedAt;

        globalInserted += tickerResult.documentsInserted;

        stats.tickersProcessed += 1;
        stats.pagesVisited += tickerResult.pages;
        stats.documentsFound += tickerResult.documentsFound;
        stats.documentsInserted += tickerResult.documentsInserted;
        stats.documentsSkipped += tickerResult.documentsSkipped;
        stats.errors += tickerResult.errors;

        await this.repository.upsertCheckpoint({
          source: tickerCheckpointSource,
          cursor: tickerResult.lastProcessedUrl,
          lastProcessedAt: tickerResult.lastProcessedAt,
          metadata: buildSuccessTickerCheckpointMetadata({
            previous: checkpoint?.metadata,
            nowIso: new Date().toISOString(),
            documentsFound: tickerResult.documentsFound,
            documentsInserted: tickerResult.documentsInserted,
            documentsSkipped: tickerResult.documentsSkipped,
            pagesVisited: tickerResult.pages,
            lastProcessedUrl: tickerResult.lastProcessedUrl,
          }),
        });
      } catch (error: unknown) {
        tickerRun.errors += 1;
        tickerRun.durationMs = Date.now() - tickerStartedAt;
        stats.tickersFailed += 1;
        stats.errors += 1;

        await this.repository.upsertCheckpoint({
          source: tickerCheckpointSource,
          metadata: buildErrorTickerCheckpointMetadata({
            previous: checkpoint?.metadata,
            nowIso: new Date().toISOString(),
            errorCode: getErrorCode(error),
            errorMessage: getErrorMessage(error),
          }),
        });

        logFundamentus("ticker_failed", {
          runId,
          mode: input.mode,
          ticker,
          errorCode: getErrorCode(error),
          errorMessage: getErrorMessage(error),
        });

        if (error instanceof FundamentusSessionError) {
          throw error;
        }
      }

      tickerStats.push(tickerRun);
    }

    const finishedAt = new Date();
    stats.finishedAt = finishedAt.toISOString();

    logFundamentus("run_finished", {
      runId,
      mode: input.mode,
      stats,
    });

    return {
      runId,
      mode: input.mode,
      status: "completed",
      stats,
      tickerStats,
    };
  }

  private async collectTicker(params: {
    mode: CollectorMode;
    ticker: string;
    checkpoint: {
      cursor: string | null;
      lastProcessedAt: Date | null;
      metadata: unknown;
    } | null;
    bootstrapCutoff: Date;
    remainingBootstrapQuota: number;
    runId: string;
  }): Promise<{
    pages: number;
    documentsFound: number;
    documentsInserted: number;
    documentsSkipped: number;
    errors: number;
    lastProcessedAt: Date | null;
    lastProcessedUrl: string | null;
  }> {
    let page = 1;
    let keepPaging = true;

    let pages = 0;
    let documentsFound = 0;
    let documentsInserted = 0;
    let documentsSkipped = 0;
    let errors = 0;

    let latestProcessedAt: Date | null = params.checkpoint?.lastProcessedAt ?? null;
    let latestProcessedUrl: string | null = params.checkpoint?.cursor ?? null;

    while (keepPaging) {
      if (params.mode === "bootstrap" && documentsInserted >= params.remainingBootstrapQuota) {
        break;
      }

      const pagePayload = await this.client.fetchTickerFactsPage({
        ticker: params.ticker,
        page,
      });

      pages += 1;

      for (const row of pagePayload.items) {
        documentsFound += 1;

        const normalized = normalizeFactRow({
          ticker: params.ticker,
          row,
        });

        if (params.mode === "bootstrap" && normalized.publishedAt < params.bootstrapCutoff) {
          keepPaging = false;
          break;
        }

        const shouldStopIncremental =
          params.mode === "incremental" &&
          params.checkpoint?.lastProcessedAt &&
          normalized.publishedAt <= params.checkpoint.lastProcessedAt &&
          normalized.sourceUrl === params.checkpoint.cursor;

        if (shouldStopIncremental) {
          keepPaging = false;
          break;
        }

        try {
          const persistence = await this.repository.createRelevantDocument({
            ticker: params.ticker,
            title: normalized.title,
            sourceUrl: normalized.sourceUrl,
            publishedAt: normalized.publishedAt,
            externalSourceId: normalized.externalSourceId,
            status: "NEW",
          });

          if (persistence === "inserted") {
            documentsInserted += 1;
          } else {
            documentsSkipped += 1;
          }

          if (!latestProcessedAt || normalized.publishedAt > latestProcessedAt) {
            latestProcessedAt = normalized.publishedAt;
            latestProcessedUrl = normalized.sourceUrl;
          }
        } catch (error) {
          errors += 1;
          logFundamentus("document_persist_error", {
            runId: params.runId,
            ticker: params.ticker,
            page,
            errorCode: getErrorCode(error),
            errorMessage: getErrorMessage(error),
          });
        }
      }

      logFundamentus("ticker_page_processed", {
        runId: params.runId,
        mode: params.mode,
        ticker: params.ticker,
        page,
        documents_found: pagePayload.items.length,
        documents_inserted: documentsInserted,
        documents_skipped: documentsSkipped,
        errors,
      });

      if (!pagePayload.hasNextPage || !keepPaging) {
        break;
      }

      page += 1;
    }

    return {
      pages,
      documentsFound,
      documentsInserted,
      documentsSkipped,
      errors,
      lastProcessedAt: latestProcessedAt,
      lastProcessedUrl: latestProcessedUrl,
    };
  }
}

function buildBootstrapCutoff(days: number): Date {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  cutoff.setUTCHours(0, 0, 0, 0);

  return cutoff;
}

function getErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return "FUNDAMENTUS_INGESTION_ERROR";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 300);
  }

  return "Unknown ingestion error";
}
