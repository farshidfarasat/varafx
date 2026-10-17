import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FOREX_HISTORY_CAP,
  RATES_HISTORY_CAP,
  capForexHistory,
  capRatesHistory,
  compileFallbackHistory,
  computePricingBasis,
  isHistoryRecordTime,
  parsePersianPrice,
  pickTomanRate,
  pickUsdtBuyCost,
  pickUsdtRate,
} from "../src/rate-selection.ts";

const LIVE = { buy: 173_900, sell: 174_100 };
const ALANCHAND = { buy: 173_500, sell: 174_000 };
const ARCHIVE = { buy: 172_000, sell: 172_500 };
const USD_FALLBACK: [number, number] = [174_000, 174_500];

function sourceSet(overrides: {
  bonbastMode?: "live" | "archive" | null;
  bonbastDate?: string | null;
  bonbast?: { buy: number; sell: number } | null;
  alanchand?: { buy: number; sell: number } | null;
} = {}) {
  return {
    bonbastMode: null as "live" | "archive" | null,
    bonbastDate: null as string | null,
    bonbast: null as { buy: number; sell: number } | null,
    alanchand: null as { buy: number; sell: number } | null,
    ...overrides,
  };
}

test("all providers down -> hardcoded fallback constants, source exactly 'Fallback'", () => {
  const pick = pickTomanRate(sourceSet(), USD_FALLBACK[0], USD_FALLBACK[1]);
  assert.equal(pick.source, "Fallback");
  assert.equal(pick.buy, 174_000);
  assert.equal(pick.sell, 174_500);
});

test("a working live Bonbast is never bypassed — it beats every other source", () => {
  const pick = pickTomanRate(
    sourceSet({ bonbastMode: "live", bonbast: LIVE, alanchand: ALANCHAND }),
    USD_FALLBACK[0],
    USD_FALLBACK[1]
  );
  assert.equal(pick.source, "Bonbast (Live)");
  assert.equal(pick.buy, LIVE.buy);
  assert.equal(pick.sell, LIVE.sell);
});

test("live Bonbast down -> AlanChand serves", () => {
  const pick = pickTomanRate(
    sourceSet({ bonbastMode: "archive", bonbast: ARCHIVE, alanchand: ALANCHAND }),
    USD_FALLBACK[0],
    USD_FALLBACK[1]
  );
  assert.equal(pick.source, "AlanChand");
  assert.equal(pick.buy, ALANCHAND.buy);
});

test("archive Bonbast serves only when live Bonbast and AlanChand are both down, labeled with its date", () => {
  const pick = pickTomanRate(
    sourceSet({ bonbastMode: "archive", bonbastDate: "2026-09-01", bonbast: ARCHIVE }),
    USD_FALLBACK[0],
    USD_FALLBACK[1]
  );
  assert.equal(pick.source, "Bonbast (Archive 2026-09-01)");
  assert.equal(pick.buy, ARCHIVE.buy);
  assert.equal(pick.sell, ARCHIVE.sell);
});

test("archive without a date is labeled plainly, never as a live provider", () => {
  const pick = pickTomanRate(
    sourceSet({ bonbastMode: "archive", bonbast: ARCHIVE }),
    USD_FALLBACK[0],
    USD_FALLBACK[1]
  );
  assert.equal(pick.source, "Bonbast (Archive)");
});

test("USDT: Bitpin beats Wallex", () => {
  const pick = pickUsdtRate(
    { buy: 173_000, sell: 173_100 },
    { bid: 172_900, ask: 173_000 },
    { buy: 174_000, sell: 174_500, source: "Bonbast (Live)" }
  );
  assert.equal(pick.source, "Bitpin");
  assert.equal(pick.buy, 173_000);
});

test("USDT: Wallex serves when Bitpin is down (bid->buy, ask->sell)", () => {
  const pick = pickUsdtRate(
    null,
    { bid: 172_900, ask: 173_050 },
    { buy: 174_000, sell: 174_500, source: "Fallback" }
  );
  assert.equal(pick.source, "Wallex");
  assert.equal(pick.buy, 172_900);
  assert.equal(pick.sell, 173_050);
});

test("USDT: both crypto sources down -> the selected USD values, labeled 'Fallback'", () => {
  const pick = pickUsdtRate(null, null, { buy: 173_900, sell: 174_100, source: "Bonbast (Live)" });
  assert.equal(pick.source, "Fallback");
  assert.equal(pick.buy, 173_900);
  assert.equal(pick.sell, 174_100);
});

test("history records only inside the 25-35 minute window of the four Iran target hours", () => {
  const cases: Array<[string, boolean]> = [
    ["2026-09-08T07:00:00Z", true], // 10:30 IRST
    ["2026-09-08T10:00:00Z", true], // 13:30 IRST
    ["2026-09-08T12:00:00Z", true], // 15:30 IRST
    ["2026-09-08T14:00:00Z", true], // 17:30 IRST
    ["2026-09-08T06:54:00Z", false], // 10:24 IRST — before the window
    ["2026-09-08T07:06:00Z", false], // 10:36 IRST — after the window
    ["2026-09-08T08:00:00Z", false], // 11:30 IRST — not a target hour
    ["2026-09-08T06:00:00Z", false], // 09:30 IRST — not a target hour
    ["2026-09-08T00:00:00Z", false], // 03:30 IRST — not a target hour
  ];
  for (const [iso, expected] of cases) {
    assert.equal(isHistoryRecordTime(new Date(iso)), expected, iso);
  }
});

test("KV retention caps stay at their invariants and keep the newest entries", () => {
  assert.equal(RATES_HISTORY_CAP, 1500);
  assert.equal(FOREX_HISTORY_CAP, 60);
  const long = Array.from({ length: 1600 }, (_, i) => i);
  const cappedRates = capRatesHistory(long);
  assert.equal(cappedRates.length, 1500);
  assert.equal(cappedRates[0], 100); // newest kept, oldest dropped
  const cappedForex = capForexHistory(Array.from({ length: 61 }, (_, i) => i));
  assert.equal(cappedForex.length, 60);
  assert.equal(cappedForex[0], 1);
});

test("parsePersianPrice handles Persian digits and thousands separators", () => {
  assert.equal(parsePersianPrice("۱۷۴,۰۰۰"), 174_000);
  assert.equal(parsePersianPrice("۱,۲۰۰,۰۰۰"), 1_200_000);
  assert.equal(parsePersianPrice("174,500"), 174_500);
});

test("compileFallbackHistory maps archive history and stamps the latest USDT", () => {
  const latest = {
    rates: { USDT: { buy: 173_000, sell: 173_200 } },
    history_30d: {
      USD: [{ date: "2026-09-01", buy: 173_000, sell: 173_500 }],
      GBP: [{ date: "2026-09-01", buy: 231_000, sell: 231_500 }],
    },
  };
  const history = compileFallbackHistory(latest);
  assert.equal(history.length, 1);
  assert.equal(history[0].timestamp, "2026-09-01");
  assert.equal(history[0].usd.sell, 173_500);
  assert.equal(history[0].gbp.buy, 231_000);
  assert.equal(history[0].usdt.buy, 173_000);
  assert.deepEqual(compileFallbackHistory({}), []);
});

test("usdt buy cost: the cheapest live ask wins and names its venue", () => {
  const pick = pickUsdtBuyCost([null, { name: "Wallex", ask: 263_598 }, { name: "Later", ask: 264_000 }]);
  assert.equal(pick?.source, "Wallex");
  assert.equal(pick?.toman, 263_598);
});

test("usdt buy cost: no live order-book venue -> null, never the print or the dollar rate", () => {
  assert.equal(pickUsdtBuyCost([null, null]), null);
  assert.equal(pickUsdtBuyCost([]), null);
});

test("usdt buy cost: a zero ask is not a venue", () => {
  assert.equal(pickUsdtBuyCost([{ name: "Bad", ask: 0 }]), null);
});

test("pricing basis: a live ask above the dollar rate wins; below changes nothing", () => {
  const now = Date.parse("2026-10-17T14:00:00Z");
  const inputs = (askLive: any) => ({
    usdSell: 262_900,
    usdSource: "Bonbast (Live)",
    usdObservedAt: "2026-10-17T14:00:00Z",
    askLive,
    askPersisted: null,
    now,
  });
  const above = computePricingBasis(inputs({ toman: 263_580, source: "Wallex", observedAt: "2026-10-17T14:00:00Z" }));
  assert.equal(above.tomanPerUsd, 263_580);
  assert.equal(above.protection, "usd+ask");
  assert.equal(above.ask?.mode, "live");
  const below = computePricingBasis(inputs({ toman: 262_000, source: "Wallex", observedAt: "2026-10-17T14:00:00Z" }));
  assert.equal(below.tomanPerUsd, 262_900);
  assert.equal(below.protection, "usd+ask");
});

test("pricing basis: a persisted premium rides the fresh dollar level", () => {
  const basis = computePricingBasis({
    usdSell: 265_000,
    usdSource: "Bonbast (Live)",
    usdObservedAt: "2026-10-17T18:00:00Z",
    askLive: null,
    askPersisted: { ask: 263_580, usdSell: 262_700, source: "Wallex", observedAt: "2026-10-17T14:00:00Z" },
    now: Date.parse("2026-10-17T18:00:00Z"),
  });
  // premium 263580/262700 = 1.003351 → 265000 × 1.003351 = 265888
  assert.equal(basis.tomanPerUsd, 265_888);
  assert.equal(basis.ask?.mode, "persisted");
  assert.equal(basis.ask?.age_min, 240);
  assert.equal(basis.protection, "usd+ask");
});

test("pricing basis: no usable ask -> usd-only, honestly labeled, never a block", () => {
  const make = (askPersisted: any) => ({
    usdSell: 262_900,
    usdSource: "Bonbast (Live)",
    usdObservedAt: "2026-10-17T22:00:00Z",
    askLive: null,
    askPersisted,
    now: Date.parse("2026-10-17T22:00:00Z"),
  });
  const stale = computePricingBasis(make({ ask: 263_580, usdSell: 262_700, source: "Wallex", observedAt: "2026-10-17T14:00:00Z" }));
  assert.equal(stale.tomanPerUsd, 262_900);
  assert.equal(stale.protection, "usd-only");
  assert.equal(stale.ask, null);
  const none = computePricingBasis(make(null));
  assert.equal(none.protection, "usd-only");
  assert.equal(none.tomanPerUsd, 262_900);
});

test("pricing basis: a persisted discount never lowers the basis below the dollar rate", () => {
  const basis = computePricingBasis({
    usdSell: 265_000,
    usdSource: "Bonbast (Live)",
    usdObservedAt: "2026-10-17T18:00:00Z",
    askLive: null,
    askPersisted: { ask: 260_000, usdSell: 262_700, source: "Wallex", observedAt: "2026-10-17T17:00:00Z" },
    now: Date.parse("2026-10-17T18:00:00Z"),
  });
  assert.equal(basis.tomanPerUsd, 265_000);
});
