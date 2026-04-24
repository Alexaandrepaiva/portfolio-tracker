import type { Prisma, RelevantDocumentStatus } from "@prisma/client";
import { getDbClient } from "@/lib/db";
import type { FundamentusConfig } from "@/server/ingestion/fundamentus/config";
import { inferAssetTypeFromTicker } from "@/server/ingestion/fundamentus/normalizer";
import type {
  DiscoveryCheckpointMetadata,
  TickerCheckpointMetadata,
} from "@/server/ingestion/fundamentus/types";

type CheckpointRecord = {
  source: string;
  cursor: string | null;
  lastProcessedAt: Date | null;
  metadata: Prisma.JsonValue | null;
};

export type PersistDocumentInput = {
  ticker: string;
  title: string;
  sourceUrl: string;
  publishedAt: Date;
  externalSourceId: string;
  status?: RelevantDocumentStatus;
};

export interface FundamentusRepository {
  listTrackedTickers(): Promise<string[]>;
  ensureAsset(ticker: string): Promise<{ id: string; ticker: string }>;
  createRelevantDocument(input: PersistDocumentInput): Promise<"inserted" | "duplicate">;
  getCheckpoint(source: string): Promise<CheckpointRecord | null>;
  upsertCheckpoint(params: {
    source: string;
    cursor?: string | null;
    lastProcessedAt?: Date | null;
    metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  }): Promise<void>;
}

export class PrismaFundamentusRepository implements FundamentusRepository {
  private readonly db = getDbClient();

  constructor(private readonly config: FundamentusConfig) {}

  async listTrackedTickers(): Promise<string[]> {
    const assets = await this.db.asset.findMany({
      select: {
        ticker: true,
      },
      orderBy: {
        ticker: "asc",
      },
    });

    return assets.map((asset) => asset.ticker.toUpperCase());
  }

  async ensureAsset(ticker: string): Promise<{ id: string; ticker: string }> {
    const normalizedTicker = ticker.toUpperCase();
    const asset = await this.db.asset.upsert({
      where: { ticker: normalizedTicker },
      create: {
        ticker: normalizedTicker,
        name: normalizedTicker,
        exchange: "B3",
        type: inferAssetTypeFromTicker({
          ticker: normalizedTicker,
          actionsSuffix11Exceptions: this.config.actionsSuffix11Exceptions,
        }),
      },
      update: {},
      select: {
        id: true,
        ticker: true,
      },
    });

    return asset;
  }

  async createRelevantDocument(input: PersistDocumentInput): Promise<"inserted" | "duplicate"> {
    const asset = await this.ensureAsset(input.ticker);

    try {
      await this.db.relevantDocument.create({
        data: {
          assetId: asset.id,
          title: input.title,
          sourceUrl: input.sourceUrl,
          publishedAt: input.publishedAt,
          externalSourceId: input.externalSourceId,
          status: input.status ?? "NEW",
        },
      });

      return "inserted";
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return "duplicate";
      }

      throw error;
    }
  }

  async getCheckpoint(source: string): Promise<CheckpointRecord | null> {
    const checkpoint = await this.db.ingestionCheckpoint.findUnique({
      where: { source },
      select: {
        source: true,
        cursor: true,
        lastProcessedAt: true,
        metadata: true,
      },
    });

    return checkpoint;
  }

  async upsertCheckpoint(params: {
    source: string;
    cursor?: string | null;
    lastProcessedAt?: Date | null;
    metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  }): Promise<void> {
    await this.db.ingestionCheckpoint.upsert({
      where: { source: params.source },
      create: {
        source: params.source,
        cursor: params.cursor ?? null,
        lastProcessedAt: params.lastProcessedAt ?? null,
        metadata: params.metadata,
      },
      update: {
        cursor: params.cursor,
        lastProcessedAt: params.lastProcessedAt,
        metadata: params.metadata,
      },
    });
  }
}

export function buildTickerCheckpointSource(ticker: string): string {
  return `fundamentus:ticker:${ticker.toUpperCase()}`;
}

export function buildSuccessTickerCheckpointMetadata(params: {
  previous: unknown;
  nowIso: string;
  documentsFound: number;
  documentsInserted: number;
  documentsSkipped: number;
  pagesVisited: number;
  lastProcessedUrl: string | null;
}): TickerCheckpointMetadata {
  const previous = asObject(params.previous);
  const cleanPrevious = { ...previous };
  delete cleanPrevious.errorCode;
  delete cleanPrevious.errorMessage;
  const metadata: TickerCheckpointMetadata = {
    ...cleanPrevious,
    lastSuccessAt: params.nowIso,
    lastRunDocumentsFound: params.documentsFound,
    lastRunDocumentsInserted: params.documentsInserted,
    lastRunDocumentsSkipped: params.documentsSkipped,
    lastRunPagesVisited: params.pagesVisited,
  };

  if (params.lastProcessedUrl) {
    metadata.lastProcessedUrl = params.lastProcessedUrl;
  }

  return metadata;
}

export function buildErrorTickerCheckpointMetadata(params: {
  previous: unknown;
  nowIso: string;
  errorCode: string;
  errorMessage: string;
}): TickerCheckpointMetadata {
  const previous = asObject(params.previous);

  return {
    ...previous,
    lastErrorAt: params.nowIso,
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
  };
}

export function buildSuccessDiscoveryCheckpointMetadata(params: {
  previous: unknown;
  nowIso: string;
  tickersDiscovered: number;
}): DiscoveryCheckpointMetadata {
  const previous = asObject(params.previous);
  const cleanPrevious = { ...previous };
  delete cleanPrevious.errorCode;
  delete cleanPrevious.errorMessage;
  return {
    ...cleanPrevious,
    lastSuccessAt: params.nowIso,
    lastRunTickersDiscovered: params.tickersDiscovered,
  };
}

export function buildErrorDiscoveryCheckpointMetadata(params: {
  previous: unknown;
  nowIso: string;
  errorCode: string;
  errorMessage: string;
}): DiscoveryCheckpointMetadata {
  const previous = asObject(params.previous);

  return {
    ...previous,
    lastErrorAt: params.nowIso,
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}
