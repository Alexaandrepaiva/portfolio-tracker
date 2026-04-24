import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExternalSourceId,
  inferAssetTypeFromTicker,
  normalizeFundamentusDate,
} from "@/server/ingestion/fundamentus/normalizer";

test("normalizeFundamentusDate converts dd/mm/yyyy hh:mm into UTC Date", () => {
  const date = normalizeFundamentusDate("24/04/2026 14:30");
  assert.equal(date.toISOString(), "2026-04-24T14:30:00.000Z");
});

test("buildExternalSourceId is deterministic", () => {
  const payload = {
    ticker: "PETR4",
    publishedAt: new Date("2026-04-24T10:00:00.000Z"),
    title: "Fato Relevante",
    sourceUrl: "https://www.fundamentus.com.br/doc.pdf",
  };

  const first = buildExternalSourceId(payload);
  const second = buildExternalSourceId(payload);

  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test("inferAssetTypeFromTicker handles suffix 11 exceptions", () => {
  const exceptions = ["TAEE11"];

  assert.equal(
    inferAssetTypeFromTicker({
      ticker: "HGLG11",
      actionsSuffix11Exceptions: exceptions,
    }),
    "FII",
  );

  assert.equal(
    inferAssetTypeFromTicker({
      ticker: "TAEE11",
      actionsSuffix11Exceptions: exceptions,
    }),
    "STOCK",
  );

  assert.equal(
    inferAssetTypeFromTicker({
      ticker: "PETR4",
      actionsSuffix11Exceptions: exceptions,
    }),
    "STOCK",
  );
});
