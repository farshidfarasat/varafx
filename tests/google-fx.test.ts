import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { extractGoogleFinanceRate } from "../src/google-fx.ts";

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf-8");
}

test("beta page (current Google Finance shape): price parses from the pair-anchored data callbacks", () => {
  // Real captured pages (2026-09-13). Before the beta anchors were added,
  // none of the legacy patterns matched these pages and every pair fell
  // through to the fallback API, degrading the service.
  const cases: Array<[string, string, string, number]> = [
    ["gf-beta-eur-usd.html", "EUR", "USD", 1.1602],
    ["gf-beta-gbp-usd.html", "GBP", "USD", 1.3528],
    ["gf-beta-eur-gbp.html", "EUR", "GBP", 0.8582],
  ];
  for (const [name, from, to, expected] of cases) {
    const parsed = extractGoogleFinanceRate(fixture(name), from, to);
    assert.ok(parsed, `${from}/${to} should parse from ${name}`);
    assert.equal(parsed.pair, `${from}/${to}`);
    assert.equal(parsed.rate, expected);
  }
});

test("beta page of a different pair never yields this pair's rate", () => {
  // Pair anchoring: asking for GBP/USD on the EUR/USD page must not
  // scrape some other instrument's number.
  const parsed = extractGoogleFinanceRate(fixture("gf-beta-eur-usd.html"), "GBP", "USD");
  assert.equal(parsed, null);
});

test("legacy page shapes still parse (fallback chain of patterns intact)", () => {
  const attrPage = `<div data-last-price="1,160.31"></div>`;
  assert.equal(extractGoogleFinanceRate(attrPage, "EUR", "USD")?.rate, 1160.31);

  const classPage = `<div class="YMlKec fxKbKc">1.1602</div>`;
  assert.equal(extractGoogleFinanceRate(classPage, "EUR", "USD")?.rate, 1.1602);

  const titlePage = `<title>1.1602 EUR to USD</title>`;
  assert.equal(extractGoogleFinanceRate(titlePage, "EUR", "USD")?.rate, 1.1602);
});

test("unrecognizable page returns null, never a guessed number", () => {
  assert.equal(extractGoogleFinanceRate("<html><body>no price here</body></html>", "EUR", "USD"), null);
  assert.equal(extractGoogleFinanceRate("", "EUR", "USD"), null);
});
