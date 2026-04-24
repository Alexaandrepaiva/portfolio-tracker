import test from "node:test";
import assert from "node:assert/strict";
import {
  hasNextPageInTickerHtml,
  parseFactsFromTickerHtml,
  parseTickersFromDiscoveryHtml,
} from "@/server/ingestion/fundamentus/parser";

test("parseTickersFromDiscoveryHtml extracts and deduplicates ticker symbols", () => {
  const html = `
    <a href="detalhes.php?papel=PETR4">PETR4</a>
    <a href="detalhes.php?papel=TAEE11">TAEE11</a>
    <a href="fatos_relevantes.php?papel=PETR4">Fatos</a>
  `;

  const output = parseTickersFromDiscoveryHtml(html);
  assert.deepEqual(output, ["PETR4", "TAEE11"]);
});

test("parseFactsFromTickerHtml extracts title, date and absolute url", () => {
  const html = `
    <table>
      <tr>
        <td>24/04/2026 10:15</td>
        <td><a href="/arquivo.pdf">Fato Relevante - Guidance 2026</a></td>
      </tr>
    </table>
  `;

  const rows = parseFactsFromTickerHtml({
    html,
    baseUrl: "https://www.fundamentus.com.br",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Fato Relevante - Guidance 2026");
  assert.equal(rows[0].publishedAtRaw, "24/04/2026 10:15");
  assert.equal(rows[0].sourceUrl, "https://www.fundamentus.com.br/arquivo.pdf");
});

test("hasNextPageInTickerHtml identifies pg increment link", () => {
  const html = '<a href="fatos_relevantes.php?papel=PETR4&pg=2">Próxima</a>';
  assert.equal(hasNextPageInTickerHtml({ html, ticker: "PETR4", currentPage: 1 }), true);
  assert.equal(hasNextPageInTickerHtml({ html, ticker: "PETR4", currentPage: 2 }), false);
});
