import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeForexPairs } from "../src/index.ts";

// The REAL 2026-08-31 stored entry, verbatim (books-loop 30 Sep 2026): the
// fallback-provider era wrote the EUR<->GBP pair keys swapped — "EUR/GBP"
// carried EUR-per-GBP (1.168) instead of GBP-per-EUR (0.856) — while the USD
// pairs were self-consistent.
const SWAPPED_DAY: Record<string, number> = {
  "EUR/USD": 1.159696,
  "USD/EUR": 0.862295,
  "GBP/USD": 1.354557,
  "USD/GBP": 0.738249,
  "EUR/GBP": 1.168027,
  "GBP/EUR": 0.856144,
};

// A correct day (the 2026-09-30 stored shape).
const OK_DAY: Record<string, number> = {
  "EUR/USD": 1.13405,
  "USD/EUR": 0.881795,
  "GBP/USD": 1.322995,
  "USD/GBP": 0.755861,
  "EUR/GBP": 0.857196,
  "GBP/EUR": 1.166595,
};

test("the swapped fallback-era day normalizes back to the USD triangle", () => {
  const fixed = normalizeForexPairs(SWAPPED_DAY);
  assert.equal(fixed.swapped, true, "the swapped day is detected and swapped");
  const triangle = SWAPPED_DAY["EUR/USD"]! / SWAPPED_DAY["GBP/USD"]!;
  assert.ok(
    Math.abs(fixed.rates["EUR/GBP"]! / triangle - 1) <= 0.01,
    `EUR/GBP after repair equals the triangle (≈${triangle.toFixed(4)}), never the swapped 1.168`,
  );
  assert.ok(
    Math.abs(fixed.rates["EUR/GBP"]! - 0.8561) < 0.001,
    "EUR/GBP after repair is the true GBP-per-EUR",
  );
  assert.ok(
    Math.abs(fixed.rates["GBP/EUR"]! - 1.168) < 0.001,
    "GBP/EUR after repair is the true EUR-per-GBP",
  );
  // The self-inverse check (the order's check) passes on the swapped day too —
  // it cannot catch this class alone; the triangle check is the one that does.
  assert.ok(
    Math.abs(SWAPPED_DAY["EUR/GBP"]! * SWAPPED_DAY["GBP/EUR"]! - 1) < 0.01,
    "self-inverse passes even on the swapped day (why the triangle check is required)",
  );
});

test("a correct day passes unchanged", () => {
  const fixed = normalizeForexPairs(OK_DAY);
  assert.equal(fixed.swapped, false, "a correct day is not touched");
  assert.equal(fixed.checked, true, "the checks ran");
  assert.deepEqual(fixed.rates, OK_DAY, "rates identical");
});

test("missing USD legs — the checks cannot run, nothing invented", () => {
  const fixed = normalizeForexPairs({ "EUR/GBP": 1.168027, "GBP/EUR": 0.856144 });
  assert.equal(fixed.checked, false, "no triangle without the USD legs");
  assert.equal(fixed.swapped, false, "nothing swapped, nothing guessed");
  assert.deepEqual(fixed.rates, { "EUR/GBP": 1.168027, "GBP/EUR": 0.856144 });
});

test("a genuinely wrong pair (neither key matches the triangle) is never 'fixed'", () => {
  const broken = {
    "EUR/USD": 1.13405,
    "GBP/USD": 1.322995,
    "EUR/GBP": 0.5, // neither 0.5 nor its inverse is the triangle (0.857)
    "GBP/EUR": 0.6,
  };
  const fixed = normalizeForexPairs(broken);
  assert.equal(fixed.swapped, false, "no swap — a swap would invent a rate");
  assert.deepEqual(fixed.rates, broken, "the day stays as-is for a human");
});
