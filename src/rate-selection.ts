// Pure rate-selection logic, extracted from index.ts so the pricing invariants
// are mechanically enforced by tests/rate-invariants.test.ts.
//
// Invariants (AGENTS.md):
// - Fallback chain order: Bonbast (Live) -> AlanChand -> Bonbast (Archive) -> constants.
//   Navasan was removed from the chain by owner order 2026-09-13 — no API key
//   exists; do not re-add it.
// - Never bypass a working live provider to serve archive or fallback data.
// - Every rate is published with its source; the hardcoded fallback constants
//   are always labeled "Fallback" — never presented as a live provider's.
// - KV retention caps: rates_history last 1500 entries (~12 months), forex_history last 60 days.
// - The history-record minute window (25-35 past the hour, Iran time) is deliberate
//   scheduler-skew tolerance — do not "fix" it.

export interface TomanQuote {
  buy: number;
  sell: number;
}

export interface TomanSourceSet {
  bonbastMode: "live" | "archive" | null;
  bonbastDate: string | null;
  bonbast: TomanQuote | null;
  alanchand: TomanQuote | null;
}

export interface SelectedRate extends TomanQuote {
  source: string;
}

export function pickTomanRate(
  sources: TomanSourceSet,
  fallbackBuy: number,
  fallbackSell: number
): SelectedRate {
  if (sources.bonbastMode === "live" && sources.bonbast) {
    return { buy: sources.bonbast.buy, sell: sources.bonbast.sell, source: "Bonbast (Live)" };
  }
  if (sources.alanchand) {
    return { buy: sources.alanchand.buy, sell: sources.alanchand.sell, source: "AlanChand" };
  }
  if (sources.bonbastMode === "archive" && sources.bonbast) {
    return {
      buy: sources.bonbast.buy,
      sell: sources.bonbast.sell,
      source: sources.bonbastDate
        ? `Bonbast (Archive ${sources.bonbastDate})`
        : "Bonbast (Archive)",
    };
  }
  return { buy: fallbackBuy, sell: fallbackSell, source: "Fallback" };
}

export function pickUsdtRate(
  bitpin: TomanQuote | null,
  wallex: { bid: number; ask: number } | null,
  usdFallback: SelectedRate
): SelectedRate {
  if (bitpin) {
    return { buy: bitpin.buy, sell: bitpin.sell, source: "Bitpin" };
  }
  if (wallex) {
    return { buy: wallex.bid, sell: wallex.ask, source: "Wallex" };
  }
  return { buy: usdFallback.buy, sell: usdFallback.sell, source: "Fallback" };
}

export interface UsdtAskVenue {
  name: string;
  /** Toman per USDT — the executable ask from a real order book, not a
   *  last-trade print. */
  ask: number;
}

/**
 * The honest tether buy cost (2026-10-17 spread review): the cheapest
 * executable ask among the live order-book venues. Bitpin publishes only a
 * last-trade print — a record of the last trade, not a price you can
 * execute; measured live it sat 0.3% under the real ask — so it is never a
 * buy-cost source, and the dollar rate is the thing being hedged. No live
 * venue -> null: absence is published as null, never a fallback to the
 * print or the dollar rate.
 */
export function pickUsdtBuyCost(venues: (UsdtAskVenue | null)[]): { toman: number; source: string } | null {
  const live = venues.filter((v): v is UsdtAskVenue => !!v && v.ask > 0);
  if (live.length === 0) return null;
  const cheapest = live.slice().sort((a, b) => a.ask - b.ask)[0];
  return { toman: Math.round(cheapest.ask), source: cheapest.name };
}

export const ASK_PERSIST_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface PricingBasisInputs {
  /** The freshly picked USD sell rate (Toman per USD). */
  usdSell: number;
  usdSource: string;
  usdObservedAt: string;
  /** The live executable ask this run, when Wallex landed (Toman per USDT). */
  askLive: { toman: number; source: string; observedAt: string } | null;
  /** The last landed ask with the USD sell it was observed against (KV-persisted). */
  askPersisted: { ask: number; usdSell: number; source: string; observedAt: string } | null;
  now: number;
  maxAskAgeMs?: number;
}

export interface PricingBasis {
  tomanPerUsd: number;
  rule: "max(USD sell, USDT executable ask)";
  usd: { sell: number; source: string; observed_at: string };
  ask:
    | {
        toman: number;
        source: string;
        observed_at: string;
        age_min: number;
        mode: "live" | "persisted";
      }
    | null;
  protection: "usd+ask" | "usd-only";
}

/**
 * The owner's B ruling (2026-10-17): the quote basis is the HIGHER of the
 * dollar sell rate and the tether executable ask — a tiny tether discount
 * changes nothing, a tether premium is covered. Wallex (the only reachable
 * venue with a real ask) rejects the Workers egress on most runs, so between
 * landings the persisted ask protects through its PREMIUM: ask/usdSell is
 * the slow-moving quantity, so the persisted premium rides the fresh dollar
 * level — never a stale absolute price. No usable ask at all (none landed
 * within the age cap) → usd-only, honestly labeled: the protection lapses
 * exactly as it does today, and sales never block on it.
 */
export function computePricingBasis(inputs: PricingBasisInputs): PricingBasis {
  const usd = { sell: inputs.usdSell, source: inputs.usdSource, observed_at: inputs.usdObservedAt };
  const cap = inputs.maxAskAgeMs ?? ASK_PERSIST_MAX_AGE_MS;
  const ageMs = (observedAt: string) => inputs.now - Date.parse(observedAt);

  if (inputs.askLive && inputs.askLive.toman > 0) {
    const ask = {
      toman: Math.round(inputs.askLive.toman),
      source: inputs.askLive.source,
      observed_at: inputs.askLive.observedAt,
      age_min: Math.max(0, Math.round(ageMs(inputs.askLive.observedAt) / 60000)),
      mode: "live" as const,
    };
    return {
      tomanPerUsd: Math.max(inputs.usdSell, ask.toman),
      rule: "max(USD sell, USDT executable ask)",
      usd,
      ask,
      protection: "usd+ask",
    };
  }

  const p = inputs.askPersisted;
  if (p && p.ask > 0 && p.usdSell > 0 && Number.isFinite(ageMs(p.observedAt)) && ageMs(p.observedAt) <= cap) {
    const premium = p.ask / p.usdSell;
    const ask = {
      toman: Math.round(inputs.usdSell * premium),
      source: p.source,
      observed_at: p.observedAt,
      age_min: Math.max(0, Math.round(ageMs(p.observedAt) / 60000)),
      mode: "persisted" as const,
    };
    return {
      tomanPerUsd: Math.max(inputs.usdSell, ask.toman),
      rule: "max(USD sell, USDT executable ask)",
      usd,
      ask,
      protection: "usd+ask",
    };
  }

  return {
    tomanPerUsd: inputs.usdSell,
    rule: "max(USD sell, USDT executable ask)",
    usd,
    ask: null,
    protection: "usd-only",
  };
}

/**
 * Provider-agreement guard (2026-09-25, dark-company audit): a source name +
 * fresh timestamp is not proof of correctness — a mis-parsed or
 * plausible-but-wrong primary must not be labeled "live" when the secondary
 * source disagrees wildly. The cap (4%) sits far above the normal
 * inter-exchange spread (~1-2%) and far below the failure modes it exists to
 * catch (stale/garbage quotes 10%+ off). A missing secondary never blocks the
 * primary — agreement is a cross-check, not a dependency.
 */
export const PROVIDER_DISAGREEMENT_CAP = 0.04;

export function providerAgreement(
  picked: TomanQuote | null,
  secondary: TomanQuote | null
): { ok: boolean; deviation: number | null } {
  if (!picked || !secondary || !(secondary.sell > 0)) {
    return { ok: true, deviation: null };
  }
  const deviation = Math.abs(picked.sell - secondary.sell) / secondary.sell;
  return { ok: deviation <= PROVIDER_DISAGREEMENT_CAP, deviation };
}

export const RATES_HISTORY_CAP = 1500;
export const FOREX_HISTORY_CAP = 60;

export function capRatesHistory<T>(history: T[]): T[] {
  return history.slice(-RATES_HISTORY_CAP);
}

export function capForexHistory<T>(history: T[]): T[] {
  return history.slice(-FOREX_HISTORY_CAP);
}

export function isHistoryRecordTime(reference: Date = new Date()): boolean {
  // Iran Standard Time (IRST) is UTC+3:30
  const iranTime = new Date(reference.getTime() + 3.5 * 60 * 60 * 1000);
  const hour = iranTime.getUTCHours();
  const min = iranTime.getUTCMinutes();

  // We record at local times: 10:30, 13:30, 15:30, 17:30
  // Schedulers can skew by a few minutes, we check if minutes fall between 25 and 35
  const isTargetHour = [10, 13, 15, 17].includes(hour);
  const isTargetMinute = min >= 25 && min <= 35;

  return isTargetHour && isTargetMinute;
}

export function parsePersianPrice(str: string): number {
  const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
  let englishStr = str.replace(/,/g, "").trim();
  for (let i = 0; i < 10; i++) {
    englishStr = englishStr.replace(persianDigits[i], i.toString());
  }
  return parseInt(englishStr);
}

export function compileFallbackHistory(latestData: any): any[] {
  if (!latestData || !latestData.history_30d) return [];
  const usdHistory = latestData.history_30d.USD || [];
  const gbpHistory = latestData.history_30d.GBP || [];

  return usdHistory.map((entry: any, index: number) => {
    const gbpEntry = gbpHistory[index] || {};
    return {
      timestamp: entry.date,
      usd: { buy: entry.buy, sell: entry.sell },
      gbp: { buy: gbpEntry.buy, sell: gbpEntry.sell },
      usdt: { buy: latestData.rates.USDT.buy, sell: latestData.rates.USDT.sell },
    };
  });
}
