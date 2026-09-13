// Pure Google Finance quote-page parsing, extracted from index.ts so the
// scraper's page-shape coverage is mechanically enforced by
// tests/google-fx.test.ts.
//
// Google serves two page shapes (observed 2026-09-13):
// - Legacy: /finance/quote/EUR-USD with data-last-price attributes.
// - Beta (current): redirects to /finance/beta/quote/EUR-USD, which renders
//   the price client-side; the only server-side price carriers are the
//   AF_initDataCallback JSON blobs, where the instrument's own entry carries
//   the pair name followed by the price.
//
// Invariants (AGENTS.md):
// - Scrapers are regex-anchored to each provider's current page; a provider
//   layout change surfaces as a failed source in the `connections` panel,
//   never as a wrong number. This parser therefore returns null on any page
//   it cannot confidently anchor to the requested pair.

export interface GoogleFxRate {
  pair: string;
  rate: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}

function toNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

export function extractGoogleFinanceRate(
  html: string,
  from: string,
  to: string
): GoogleFxRate | null {
  // Legacy pattern 1: data-last-price attribute
  let match = html.match(/data-last-price="([^"]+)"/);
  if (match) {
    const rate = toNumber(match[1]);
    if (rate > 0) return { pair: `${from}/${to}`, rate };
  }

  // Legacy pattern 2: YMlKec fxKbKc class (main price display)
  match = html.match(/class="YMlKec fxKbKc"[^>]*>([\d.,]+)</);
  if (match) {
    const rate = toNumber(match[1]);
    if (rate > 0) return { pair: `${from}/${to}`, rate };
  }

  // Beta pattern A: summary blob — "EUR-USD","EUR / USD",1.1602,
  // (instrument code + display name directly precede the display price)
  const code = escapeRegExp(`${from}-${to}`);
  const display = escapeRegExp(`${from} / ${to}`);
  match = html.match(new RegExp(`"${code}","${display}",([\\d.]+),`));
  if (match) {
    const rate = toNumber(match[1]);
    if (rate > 0) return { pair: `${from}/${to}`, rate };
  }

  // Beta pattern B: instrument entry — "EUR / USD",3,null,[1.1602,0,0,4,4,2],
  // (display name precedes the price array)
  match = html.match(new RegExp(`"${display}",\\d+,null,\\[([\\d.]+),`));
  if (match) {
    const rate = toNumber(match[1]);
    if (rate > 0) return { pair: `${from}/${to}`, rate };
  }

  // Legacy pattern 3: PZPZlf/kf1m0 class price element
  match = html.match(/data-last-price="([^"]*)"|class="[^"]*kf1m0[^"]*"[^>]*>([\d.,]+)</);
  if (match) {
    const rate = toNumber(match[1] || match[2] || "");
    if (rate > 0) return { pair: `${from}/${to}`, rate };
  }

  // Legacy pattern 4: embedded JSON data (AF_initDataCallback, ds:5)
  const jsonMatch = html.match(/AF_initDataCallback\(\{key:\s*'ds:5'[\s\S]*?data:(\[[\s\S]*?\])\s*\}\);/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      // Navigate to find the price (structure varies)
      const price = extractPriceFromGoogleData(data);
      if (price > 0) return { pair: `${from}/${to}`, rate: price };
    } catch {
      // Fall through to next pattern
    }
  }

  // Legacy pattern 5: title tag often contains the rate
  match = html.match(/<title>([\d.,]+)\s/);
  if (match) {
    const rate = toNumber(match[1]);
    if (!isNaN(rate) && rate > 0) return { pair: `${from}/${to}`, rate };
  }

  return null;
}

function extractPriceFromGoogleData(data: any): number {
  try {
    // Try common paths in Google's data structure
    let node = data;
    // Navigate into nested arrays
    while (Array.isArray(node) && node.length > 0) {
      node = node[0];
    }
    if (Array.isArray(node) && node.length > 1) {
      // Price is often the first numeric value in a sub-array
      for (const item of node) {
        if (Array.isArray(item)) {
          for (const sub of item) {
            if (typeof sub === "number" && sub > 0 && sub < 1000) {
              return sub;
            }
          }
        }
      }
    }
    return 0;
  } catch {
    return 0;
  }
}
