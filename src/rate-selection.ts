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
