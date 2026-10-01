/**
 * Books-loop 30 Sep 2026 (the Claude check order, item 3): repair the stored
 * forex_history KV days whose EUR<->GBP pair keys were written SWAPPED by
 * the fallback-provider era (2026-08-31..09-12: "EUR/GBP" carries
 * EUR-per-GBP instead of GBP-per-EUR, while the USD pairs are
 * self-consistent). The fix at src/index.ts (the fallback's EUR/GBP = GBP/EUR
 * division + the normalizeForexPairs write-time check) stops NEW swapped
 * days; this script repairs the STORED ones with the same check:
 *
 *   triangle = (EUR/USD) / (GBP/USD)  // (USD per EUR) / (USD per GBP) = GBP per EUR
 *   if EUR/GBP deviates >1% from the triangle while GBP/EUR matches it,
 *   the two keys are swapped — swap them back and put.
 *
 * A day that fails the triangle with NEITHER key matching stays as-is and is
 * listed (never invent a rate). Dry run by default; --apply writes.
 *
 * Usage: node scripts/repair-forex-history.mjs [--apply]
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const NAMESPACE_ID = "bdc3b0f603f84a25958af622f0bf550b";
const APPLY = process.argv.includes("--apply");
const wranglerJs = new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

async function wrangler(...args) {
  const { stdout } = await execFileP(process.execPath, [wranglerJs, ...args], { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

function repairDay(rates) {
  const num = (k) => Number(rates[k]);
  const eurUsd = num("EUR/USD");
  const gbpUsd = num("GBP/USD");
  const eurGbp = num("EUR/GBP");
  const gbpEur = num("GBP/EUR");
  if (!(eurUsd > 0) || !(gbpUsd > 0)) return { checked: false, swapped: false };
  const triangle = eurUsd / gbpUsd;
  const off = (v) => !(v > 0) || Math.abs(v / triangle - 1) > 0.01;
  if (off(eurGbp) && gbpEur > 0 && Math.abs(gbpEur / triangle - 1) <= 0.01) {
    const out = { ...rates, "EUR/GBP": gbpEur, "GBP/EUR": eurGbp };
    return { checked: true, swapped: true, rates: out };
  }
  return { checked: true, swapped: false, broken: off(eurGbp) };
}

const listing = JSON.parse(await wrangler("kv", "key", "list", "--namespace-id", NAMESPACE_ID, "--prefix", "forex_history:"));
const keys = listing.map((k) => k.name).filter(Boolean).sort();
console.log(`forex_history keys: ${keys.length}`);

let swapped = 0;
let ok = 0;
let broken = 0;
const unfixable = [];
for (const key of keys) {
  const raw = await wrangler("kv", "key", "get", "--namespace-id", NAMESPACE_ID, key);
  let entry;
  try {
    entry = JSON.parse(raw);
  } catch {
    unfixable.push(`${key}: unparsable`);
    continue;
  }
  const res = repairDay(entry.rates ?? {});
  if (!res.checked) {
    unfixable.push(`${key}: no USD legs — checks cannot run, left as-is`);
    continue;
  }
  if (res.swapped) {
    swapped += 1;
    const fixed = { ...entry, rates: res.rates, note: (entry.note ?? "") + " | EUR/GBP pair keys repaired (swapped by the fallback-provider era, books-loop 30 Sep 2026)" };
    console.log(`SWAPPED  ${key}: EUR/GBP ${entry.rates["EUR/GBP"]} -> ${res.rates["EUR/GBP"]} (triangle ${(Number(entry.rates["EUR/USD"]) / Number(entry.rates["GBP/USD"])).toFixed(6)})${APPLY ? " [put]" : " [dry]"}`);
    if (APPLY) {
      await wrangler("kv", "key", "put", "--namespace-id", NAMESPACE_ID, key, JSON.stringify(fixed));
    }
  } else if (res.broken) {
    broken += 1;
    unfixable.push(`${key}: triangle disagrees with BOTH keys — left as-is, listed`);
  } else {
    ok += 1;
  }
}

console.log(`days: ${keys.length} | correct: ${ok} | swapped ${APPLY ? "and repaired" : "needing repair"}: ${swapped} | unfixable (listed): ${broken + unfixable.length}`);
for (const u of unfixable) console.log(`  ${u}`);
if (!APPLY && swapped > 0) console.log("dry run — re-run with --apply to repair");
