-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('STOCK', 'FII');

-- CreateEnum
CREATE TYPE "RelevantDocumentStatus" AS ENUM ('NEW', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiSummarySentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "exchange" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioAsset" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "averageCost" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeilingPrice" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "ceilingPrice" DECIMAL(18,6) NOT NULL,
    "source" TEXT NOT NULL,
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeilingPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closePrice" DECIMAL(18,6) NOT NULL,
    "dailyChangePct" DECIMAL(8,4) NOT NULL,
    "volume" BIGINT,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelevantDocument" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "externalSourceId" TEXT,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "status" "RelevantDocumentStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelevantDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSummary" (
    "id" TEXT NOT NULL,
    "relevantDocumentId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sentiment" "AiSummarySentiment",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionCheckpoint" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "cursor" TEXT,
    "lastProcessedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_ticker_key" ON "Asset"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioAsset_assetId_key" ON "PortfolioAsset"("assetId");

-- CreateIndex
CREATE INDEX "MarketSnapshot_assetId_capturedAt_idx" ON "MarketSnapshot"("assetId", "capturedAt");

-- CreateIndex
CREATE INDEX "RelevantDocument_assetId_publishedAt_idx" ON "RelevantDocument"("assetId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RelevantDocument_externalSourceId_key" ON "RelevantDocument"("externalSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AiSummary_relevantDocumentId_key" ON "AiSummary"("relevantDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionCheckpoint_source_key" ON "IngestionCheckpoint"("source");

-- AddForeignKey
ALTER TABLE "PortfolioAsset" ADD CONSTRAINT "PortfolioAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeilingPrice" ADD CONSTRAINT "CeilingPrice_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelevantDocument" ADD CONSTRAINT "RelevantDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSummary" ADD CONSTRAINT "AiSummary_relevantDocumentId_fkey" FOREIGN KEY ("relevantDocumentId") REFERENCES "RelevantDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
