export const FUNDAMENTUS_SOURCE = "fundamentus";
export const DISCOVERY_CHECKPOINT_SOURCE = `${FUNDAMENTUS_SOURCE}:discovery`;

export type CollectorMode = "bootstrap" | "incremental";

export type TickerFactsPage = {
  ticker: string;
  page: number;
  items: ParsedFactRow[];
  hasNextPage: boolean;
};

export type ParsedFactRow = {
  title: string;
  sourceUrl: string;
  publishedAtRaw: string;
};

export type NormalizedFactRow = {
  title: string;
  normalizedTitle: string;
  sourceUrl: string;
  publishedAt: Date;
  externalSourceId: string;
};

export type TickerRunStats = {
  ticker: string;
  pages: number;
  documentsFound: number;
  documentsInserted: number;
  documentsSkipped: number;
  errors: number;
  durationMs: number;
};

export type RunStats = {
  tickersDiscovered: number;
  tickersProcessed: number;
  tickersFailed: number;
  pagesVisited: number;
  documentsFound: number;
  documentsInserted: number;
  documentsSkipped: number;
  errors: number;
  startedAt: string;
  finishedAt: string;
};

export type RunResult = {
  runId: string;
  mode: CollectorMode;
  status: "completed";
  stats: RunStats;
  tickerStats: TickerRunStats[];
};

export type RunnerInput = {
  mode: CollectorMode;
};

export type TickerCheckpointMetadata = {
  lastSuccessAt?: string;
  lastErrorAt?: string;
  errorCode?: string;
  errorMessage?: string;
  lastRunDocumentsFound?: number;
  lastRunDocumentsInserted?: number;
  lastRunDocumentsSkipped?: number;
  lastRunPagesVisited?: number;
  lastProcessedUrl?: string;
};

export type DiscoveryCheckpointMetadata = {
  lastSuccessAt?: string;
  lastErrorAt?: string;
  errorCode?: string;
  errorMessage?: string;
  lastRunTickersDiscovered?: number;
};
