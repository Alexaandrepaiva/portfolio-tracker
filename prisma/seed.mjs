import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const petr4 = await prisma.asset.upsert({
    where: { ticker: "PETR4" },
    update: {},
    create: {
      ticker: "PETR4",
      name: "Petrobras PN",
      type: "STOCK",
      exchange: "B3",
    },
  });

  const hglg11 = await prisma.asset.upsert({
    where: { ticker: "HGLG11" },
    update: {},
    create: {
      ticker: "HGLG11",
      name: "CSHG Logistica FII",
      type: "FII",
      exchange: "B3",
    },
  });

  await prisma.portfolioAsset.upsert({
    where: { assetId: petr4.id },
    update: { quantity: 120, averageCost: 33.5 },
    create: {
      assetId: petr4.id,
      quantity: 120,
      averageCost: 33.5,
    },
  });

  await prisma.portfolioAsset.upsert({
    where: { assetId: hglg11.id },
    update: { quantity: 15, averageCost: 164.9 },
    create: {
      assetId: hglg11.id,
      quantity: 15,
      averageCost: 164.9,
    },
  });

  await prisma.ceilingPrice.createMany({
    data: [
      {
        assetId: petr4.id,
        ceilingPrice: 37,
        source: "manual-seed",
        referenceDate: new Date("2026-01-15T00:00:00.000Z"),
      },
      {
        assetId: hglg11.id,
        ceilingPrice: 172,
        source: "manual-seed",
        referenceDate: new Date("2026-01-15T00:00:00.000Z"),
      },
    ],
    skipDuplicates: true,
  });

  await prisma.marketSnapshot.createMany({
    data: [
      {
        assetId: petr4.id,
        closePrice: 35.42,
        dailyChangePct: 1.22,
        volume: BigInt(28394800),
      },
      {
        assetId: hglg11.id,
        closePrice: 167.1,
        dailyChangePct: -0.37,
        volume: BigInt(480120),
      },
    ],
  });

  const document = await prisma.relevantDocument.create({
    data: {
      assetId: petr4.id,
      externalSourceId: "seed-doc-petr4-20260115",
      title: "Comunicado de resultados trimestrais",
      sourceUrl: "https://example.com/petr4/comunicado",
      publishedAt: new Date("2026-01-15T12:00:00.000Z"),
      status: "PROCESSED",
    },
  });

  await prisma.aiSummary.create({
    data: {
      relevantDocumentId: document.id,
      model: "gpt-4.1-mini",
      summary:
        "Resultado trimestral indica melhora de margem operacional com manutenção do plano de investimentos.",
      sentiment: "NEUTRAL",
    },
  });

  await prisma.ingestionCheckpoint.upsert({
    where: { source: "b3-relevant-facts" },
    update: {
      cursor: "2026-01-15T12:00:00.000Z",
      lastProcessedAt: new Date("2026-01-15T12:00:00.000Z"),
    },
    create: {
      source: "b3-relevant-facts",
      cursor: "2026-01-15T12:00:00.000Z",
      lastProcessedAt: new Date("2026-01-15T12:00:00.000Z"),
      metadata: { seeded: true },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
