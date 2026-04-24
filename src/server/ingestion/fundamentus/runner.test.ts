import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { getFundamentusConfig } from "@/server/ingestion/fundamentus/config";
import { FundamentusCollectorRunner } from "@/server/ingestion/fundamentus/runner";
import type {
  FundamentusRepository,
  PersistDocumentInput,
} from "@/server/ingestion/fundamentus/repository";

type InMemoryAsset = {
  id: string;
  ticker: string;
};

type InMemoryCheckpoint = {
  source: string;
  cursor: string | null;
  lastProcessedAt: Date | null;
  metadata: Prisma.JsonValue | null;
};

class InMemoryRepository implements FundamentusRepository {
  private assetCounter = 0;
  readonly assets = new Map<string, InMemoryAsset>();
  readonly documents = new Map<string, PersistDocumentInput>();
  readonly checkpoints = new Map<string, InMemoryCheckpoint>();

  async listTrackedTickers(): Promise<string[]> {
    return [...this.assets.keys()].sort((a, b) => a.localeCompare(b));
  }

  async ensureAsset(ticker: string): Promise<{ id: string; ticker: string }> {
    const normalizedTicker = ticker.toUpperCase();
    const existing = this.assets.get(normalizedTicker);

    if (existing) {
      return existing;
    }

    this.assetCounter += 1;
    const asset = {
      id: `asset-${this.assetCounter}`,
      ticker: normalizedTicker,
    };

    this.assets.set(normalizedTicker, asset);
    return asset;
  }

  async createRelevantDocument(input: PersistDocumentInput): Promise<"inserted" | "duplicate"> {
    await this.ensureAsset(input.ticker);

    if (this.documents.has(input.externalSourceId)) {
      return "duplicate";
    }

    this.documents.set(input.externalSourceId, input);
    return "inserted";
  }

  async getCheckpoint(source: string): Promise<InMemoryCheckpoint | null> {
    return this.checkpoints.get(source) ?? null;
  }

  async upsertCheckpoint(params: {
    source: string;
    cursor?: string | null;
    lastProcessedAt?: Date | null;
    metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  }): Promise<void> {
    const previous = this.checkpoints.get(params.source);

    this.checkpoints.set(params.source, {
      source: params.source,
      cursor: params.cursor ?? previous?.cursor ?? null,
      lastProcessedAt: params.lastProcessedAt ?? previous?.lastProcessedAt ?? null,
      metadata: (params.metadata as Prisma.JsonValue | null | undefined) ?? previous?.metadata ?? null,
    });
  }
}

test("runner is idempotent and updates checkpoints on incremental runs", async () => {
  const repository = new InMemoryRepository();
  await repository.ensureAsset("PETR4");
  const client = {
    discoverTickers: async () => ["PETR4"],
    fetchTickerFactsPage: async ({ page }: { ticker: string; page: number }) => {
      if (page > 1) {
        return { items: [], hasNextPage: false };
      }

      return {
        hasNextPage: false,
        items: [
          {
            title: "Fato Relevante A",
            publishedAtRaw: "24/04/2026 10:00",
            sourceUrl: "https://www.fundamentus.com.br/a.pdf",
          },
        ],
      };
    },
  };

  const config = {
    ...getFundamentusConfig(),
    bootstrapDays: 30,
    bootstrapDocLimit: 100,
  };

  const runner = new FundamentusCollectorRunner({ config, repository, client });

  const first = await runner.run({ mode: "incremental" });
  const second = await runner.run({ mode: "incremental" });

  assert.equal(first.stats.documentsInserted, 1);
  assert.equal(second.stats.documentsInserted, 0);
  assert.equal(second.stats.documentsSkipped, 0);
  assert.equal(repository.assets.has("PETR4"), true);
  assert.equal(repository.checkpoints.has("fundamentus:ticker:PETR4"), true);
});

test("runner continues when one ticker fails", async () => {
  const repository = new InMemoryRepository();
  await repository.ensureAsset("FAIL4");
  await repository.ensureAsset("VALE3");
  const client = {
    discoverTickers: async () => ["FAIL4", "VALE3"],
    fetchTickerFactsPage: async ({ ticker }: { ticker: string; page: number }) => {
      if (ticker === "FAIL4") {
        throw new Error("simulated ticker failure");
      }

      return {
        hasNextPage: false,
        items: [
          {
            title: "Fato Relevante B",
            publishedAtRaw: "24/04/2026",
            sourceUrl: "https://www.fundamentus.com.br/b.pdf",
          },
        ],
      };
    },
  };

  const runner = new FundamentusCollectorRunner({
    config: getFundamentusConfig(),
    repository,
    client,
  });

  const result = await runner.run({ mode: "incremental" });

  assert.equal(result.stats.tickersFailed, 1);
  assert.equal(result.stats.tickersProcessed, 1);
  assert.equal(result.stats.documentsInserted, 1);
  assert.equal(repository.assets.has("VALE3"), true);
});

test("runner processes only tracked assets", async () => {
  const repository = new InMemoryRepository();
  await repository.ensureAsset("HGLG11");
  const visitedTickers: string[] = [];
  const client = {
    discoverTickers: async () => ["PETR4", "HGLG11", "BBSE3"],
    fetchTickerFactsPage: async ({ ticker }: { ticker: string; page: number }) => {
      visitedTickers.push(ticker);

      return {
        hasNextPage: false,
        items: [
          {
            title: `Fato ${ticker}`,
            publishedAtRaw: "24/04/2026",
            sourceUrl: `https://www.fundamentus.com.br/${ticker}.pdf`,
          },
        ],
      };
    },
  };

  const runner = new FundamentusCollectorRunner({
    config: getFundamentusConfig(),
    repository,
    client,
  });

  const result = await runner.run({ mode: "incremental" });

  assert.deepEqual(visitedTickers, ["HGLG11"]);
  assert.equal(result.stats.tickersDiscovered, 1);
  assert.equal(result.stats.documentsInserted, 1);
});
