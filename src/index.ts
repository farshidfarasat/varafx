import { dashboardHtml } from "./dashboard";

interface CacheStore {
  data: any;
  timestamp: number;
}

let inMemoryCache: CacheStore | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Route: GET /
    if (url.pathname === "/" || url.pathname === "/dashboard") {
      return new Response(dashboardHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    // Route: GET /api/rates
    if (url.pathname === "/api/rates") {
      try {
        const data = await getCachedRates();
        return new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=300",
          },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            status: "error",
            message: err.message || "Failed to fetch exchange rates",
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }

    // Default: 404
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Not Found",
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  },
};

async function getCachedRates(): Promise<any> {
  const now = Date.now();
  if (inMemoryCache && now - inMemoryCache.timestamp < CACHE_TTL) {
    return inMemoryCache.data;
  }

  // Cache expired or null, fetch fresh data
  const data = await fetchFreshRates();
  inMemoryCache = {
    data,
    timestamp: now,
  };
  return data;
}

async function fetchFreshRates(): Promise<any> {
  // Fetch in parallel using Promise.allSettled to prevent one failing source from blocking everything
  const [archiveResult, bitpinResult, wallexResult, erApiResult] = await Promise.allSettled([
    fetchArchiveRates(),
    fetchBitpinUsdt(),
    fetchWallexUsdt(),
    fetchOfficialRates(),
  ]);

  // 1. Process Archive Rates (USD / GBP / EUR)
  let usdSell = 174000; // sensible fallbacks
  let usdBuy = 173500;
  let gbpSell = 232000;
  let gbpBuy = 231000;
  let historyUSD: any[] = [];
  let historyGBP: any[] = [];
  let archiveSource = "rial-exchange-rates-archive (Bonbast)";

  if (archiveResult.status === "fulfilled" && archiveResult.value) {
    const archiveData = archiveResult.value;
    const dates = Object.keys(archiveData).sort();
    if (dates.length > 0) {
      const latestDate = dates[dates.length - 1];
      const latestRates = archiveData[latestDate];
      
      if (latestRates.usd) {
        usdSell = latestRates.usd.sell;
        usdBuy = latestRates.usd.buy;
      }
      if (latestRates.gbp) {
        gbpSell = latestRates.gbp.sell;
        gbpBuy = latestRates.gbp.buy;
      }

      // Collect last 7 days of history
      const last7Dates = dates.slice(-7);
      historyUSD = last7Dates.map(d => ({
        date: d,
        sell: archiveData[d].usd?.sell || usdSell,
        buy: archiveData[d].usd?.buy || usdBuy,
      }));
      historyGBP = last7Dates.map(d => ({
        date: d,
        sell: archiveData[d].gbp?.sell || gbpSell,
        buy: archiveData[d].gbp?.buy || gbpBuy,
      }));
    }
  } else {
    console.error("Archive fetch failed:", archiveResult.status === "rejected" ? archiveResult.reason : "Unknown error");
    archiveSource = "cial-market-fallback (Offline)";
  }

  // 2. Process USDT sources
  let bitpinPrice: number | null = null;
  if (bitpinResult.status === "fulfilled" && bitpinResult.value) {
    bitpinPrice = bitpinResult.value;
  } else {
    console.error("Bitpin fetch failed:", bitpinResult.status === "rejected" ? bitpinResult.reason : "Unknown error");
  }

  let wallexBid: number | null = null;
  let wallexAsk: number | null = null;
  let wallexLast: number | null = null;
  if (wallexResult.status === "fulfilled" && wallexResult.value) {
    wallexBid = wallexResult.value.bid;
    wallexAsk = wallexResult.value.ask;
    wallexLast = wallexResult.value.last;
  } else {
    console.error("Wallex fetch failed:", wallexResult.status === "rejected" ? wallexResult.reason : "Unknown error");
  }

  // Combine USDT rates
  let usdtBuy = usdBuy; // Fallback to free USD buy
  let usdtSell = usdSell; // Fallback to free USD sell
  const usdtSources: any = {};

  if (bitpinPrice) {
    usdtSources["Bitpin"] = { price: bitpinPrice, unit: "Toman" };
  }
  if (wallexLast) {
    usdtSources["Wallex"] = { buy: wallexBid, sell: wallexAsk, last: wallexLast, unit: "Toman" };
  }

  const usdtPricesToAverageBuy: number[] = [];
  const usdtPricesToAverageSell: number[] = [];

  if (bitpinPrice) {
    usdtPricesToAverageBuy.push(bitpinPrice);
    usdtPricesToAverageSell.push(bitpinPrice);
  }
  if (wallexBid && wallexAsk) {
    usdtPricesToAverageBuy.push(wallexBid);
    usdtPricesToAverageSell.push(wallexAsk);
  }

  if (usdtPricesToAverageBuy.length > 0) {
    usdtBuy = Math.round(usdtPricesToAverageBuy.reduce((a, b) => a + b, 0) / usdtPricesToAverageBuy.length);
  }
  if (usdtPricesToAverageSell.length > 0) {
    usdtSell = Math.round(usdtPricesToAverageSell.reduce((a, b) => a + b, 0) / usdtPricesToAverageSell.length);
  }

  // 3. Process Official CBI Rates
  let officialUsdRate = 420000; // Standard legacy fallback (in IRR)
  let officialGbpRate = 530000;
  let officialSource = "ExchangeRate-API (Central Bank)";

  if (erApiResult.status === "fulfilled" && erApiResult.value) {
    officialUsdRate = erApiResult.value.usdToIrr;
    officialGbpRate = erApiResult.value.gbpToIrr;
  } else {
    console.error("Official rates fetch failed:", erApiResult.status === "rejected" ? erApiResult.reason : "Unknown error");
    officialSource = "CBI-fallback (Offline)";
  }

  // Format final aggregated JSON structure
  return {
    status: "success",
    timestamp: new Date().toISOString(),
    rates: {
      USD: {
        source: archiveSource,
        buy: usdBuy,
        sell: usdSell,
        unit: "Toman",
      },
      GBP: {
        source: archiveSource,
        buy: gbpBuy,
        sell: gbpSell,
        unit: "Toman",
      },
      USDT: {
        source: Object.keys(usdtSources).length > 0 ? "Aggregated (Bitpin, Wallex)" : "Fallback",
        buy: usdtBuy,
        sell: usdtSell,
        unit: "Toman",
        sources: usdtSources,
      },
    },
    official_rates: {
      USD: {
        source: officialSource,
        rate: officialUsdRate,
        unit: "Rial",
      },
      GBP: {
        source: officialSource,
        rate: officialGbpRate,
        unit: "Rial",
      },
    },
    conversions: {
      USD_TO_IRR: {
        free_market: usdSell * 10,
        official: officialUsdRate,
      },
      IRR_TO_USD: {
        free_market: parseFloat((1 / (usdSell * 10)).toFixed(12)),
        official: parseFloat((1 / officialUsdRate).toFixed(12)),
      },
      USD_TO_TMN: {
        free_market: usdSell,
        official: Math.round(officialUsdRate / 10),
      },
      TMN_TO_USD: {
        free_market: parseFloat((1 / usdSell).toFixed(12)),
        official: parseFloat((1 / (officialUsdRate / 10)).toFixed(12)),
      },
      GBP_TO_IRR: {
        free_market: gbpSell * 10,
        official: officialGbpRate,
      },
      IRR_TO_GBP: {
        free_market: parseFloat((1 / (gbpSell * 10)).toFixed(12)),
        official: parseFloat((1 / officialGbpRate).toFixed(12)),
      },
      USDT_TO_IRR: {
        free_market: usdtSell * 10,
      },
      IRR_TO_USDT: {
        free_market: parseFloat((1 / (usdtSell * 10)).toFixed(12)),
      },
    },
    history_7d: {
      USD: historyUSD,
      GBP: historyGBP,
    },
  };
}

// Fetch helper with timeout to avoid hanging connections
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Fetch helper functions
async function fetchArchiveRates(): Promise<any> {
  const response = await fetchWithTimeout(
    "https://raw.githubusercontent.com/SamadiPour/rial-exchange-rates-archive/data/gregorian_imp.min.json",
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VaraFX/1.0.0",
      },
    },
    8000
  );
  if (!response.ok) throw new Error(`Archive HTTP status: ${response.status}`);
  return response.json();
}

async function fetchBitpinUsdt(): Promise<number> {
  const response = await fetchWithTimeout("https://api.bitpin.ir/v1/mkt/markets/", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VaraFX/1.0.0",
    },
  }, 5000);
  if (!response.ok) throw new Error(`Bitpin HTTP status: ${response.status}`);
  const data: any = await response.json();
  const results = data.results || [];
  const usdtIrt = results.find((m: any) => m.code === "USDT_IRT");
  if (!usdtIrt || !usdtIrt.price) throw new Error("USDT_IRT code not found on Bitpin");
  return Math.round(parseFloat(usdtIrt.price));
}

async function fetchWallexUsdt(): Promise<{ bid: number; ask: number; last: number }> {
  const response = await fetchWithTimeout("https://api.wallex.ir/v1/markets", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VaraFX/1.0.0",
    },
  }, 5000);
  if (!response.ok) throw new Error(`Wallex HTTP status: ${response.status}`);
  const data: any = await response.json();
  const usdtTmn = data?.result?.symbols?.USDTTMN;
  if (!usdtTmn || !usdtTmn.stats) throw new Error("USDTTMN symbol not found on Wallex");
  return {
    bid: Math.round(parseFloat(usdtTmn.stats.bidPrice)),
    ask: Math.round(parseFloat(usdtTmn.stats.askPrice)),
    last: Math.round(parseFloat(usdtTmn.stats.lastPrice)),
  };
}

async function fetchOfficialRates(): Promise<{ usdToIrr: number; gbpToIrr: number }> {
  const response = await fetchWithTimeout("https://open.er-api.com/v6/latest/USD", {}, 5000);
  if (!response.ok) throw new Error(`ER API HTTP status: ${response.status}`);
  const data: any = await response.json();
  if (data.result !== "success") throw new Error("ER API response state unsuccessful");
  
  const usdToIrr = parseFloat(data.rates.IRR);
  const usdToGbp = parseFloat(data.rates.GBP);
  const gbpToIrr = Math.round(usdToIrr / usdToGbp);
  
  return {
    usdToIrr: Math.round(usdToIrr),
    gbpToIrr,
  };
}

