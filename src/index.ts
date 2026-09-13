import { dashboardHtml } from "./dashboard";
import {
  compileFallbackHistory,
  isHistoryRecordTime,
  parsePersianPrice,
  pickTomanRate,
  pickUsdtRate,
} from "./rate-selection";
import { classifyRateQuality, type RateQuality } from "./rate-quality";
import { forexHistoryKey, ratesHistoryKey } from "./history-keys";
import { extractGoogleFinanceRate, type GoogleFxRate } from "./google-fx";

interface Env {
  KV?: KVNamespace;
  NAVASAN_API_KEY?: string;
  AUTONOMY_KILL_SWITCH?: string;
}

interface CacheStore {
  data: any;
  timestamp: number;
}

interface GoogleFxCacheData {
  rates: Record<string, number>;
  source: string;
  observed_at: string;
}

let inMemoryCache: CacheStore | null = null;
let inMemoryGoogleFxCache: CacheStore | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const KV_READ_TTL = 35 * 60 * 1000; // 35 minutes in milliseconds
const GOOGLE_FX_CACHE_TTL = 15 * 60 * 1000; // 15 minutes for global FX rates

export default {
  async fetch(request: Request, env: Env, _ctx: any): Promise<Response> {
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
        const data = await getCachedRates(env);
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

    // Route: GET /api/history
    if (url.pathname === "/api/history") {
      try {
        let history: any[] = [];
        if (env.KV) {
          history = await readKeyedHistory(env.KV, "rates_history:", "rates_history");
        }

        // Fallback to daily archive trend if KV history is empty
        if (history.length === 0) {
          const latestData = await getCachedRates(env);
          history = compileFallbackHistory(latestData);
        }

        return new Response(JSON.stringify(history), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=600",
          },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            status: "error",
            message: err.message || "Failed to fetch rates history",
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

    // Route: GET /api/forex-history
    if (url.pathname === "/api/forex-history") {
      try {
        let history: any[] = [];
        if (env.KV) {
          history = await readKeyedHistory(env.KV, "forex_history:", "forex_history");
        }
        return new Response(JSON.stringify(history), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600",
          },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            status: "error",
            message: err.message || "Failed to fetch forex history",
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

  async scheduled(_event: any, env: Env, ctx: any): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};

async function getCachedRates(env: Env): Promise<any> {
  if (env.KV) {
    const cachedStr = await env.KV.get("rates_latest");
    if (cachedStr) {
      try {
        const cached = JSON.parse(cachedStr);
        if (cached.timestamp && (Date.now() - new Date(cached.timestamp).getTime()) < KV_READ_TTL) {
          return cached;
        }
      } catch (e) {
        // Ignore parsing error and fetch fresh
      }
    }
  }

  const now = Date.now();
  if (inMemoryCache && now - inMemoryCache.timestamp < CACHE_TTL) {
    return inMemoryCache.data;
  }

  const data = await fetchFreshRates(env);
  if (env.KV) {
    await env.KV.put("rates_latest", JSON.stringify(data));
  }
  inMemoryCache = {
    data,
    timestamp: now,
  };
  return data;
}

async function handleScheduled(env: Env): Promise<void> {
  if (env.AUTONOMY_KILL_SWITCH?.toLowerCase() === "true") {
    console.warn("Autonomous scheduled work halted by AUTONOMY_KILL_SWITCH");
    return;
  }
  console.log("Scheduled cron running...");
  try {
    const ratesData = await fetchFreshRates(env);
    
    // Save latest rates
    if (env.KV) {
      await env.KV.put("rates_latest", JSON.stringify(ratesData));
    }

    // Record historical data points at 10:30, 13:30, 15:30, 17:30 Iran Time
    if (isHistoryRecordTime() && env.KV) {
      const historyEntry = {
        timestamp: ratesData.timestamp,
        quality: ratesData.quality,
        usd: ratesData.rates.USD,
        gbp: ratesData.rates.GBP,
        usdt: ratesData.rates.USDT,
      };

      await env.KV.put(ratesHistoryKey(ratesData.timestamp), JSON.stringify(historyEntry));
      console.log("Historical entry recorded in KV!");
    }

    // Record daily Google FX history (once per UTC day)
    if (env.KV && ratesData.global_forex && Object.keys(ratesData.global_forex).length > 0) {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      await env.KV.put(forexHistoryKey(ratesData.timestamp), JSON.stringify({
        date: today,
        timestamp: ratesData.timestamp,
        source: ratesData.global_forex_source,
        quality: ratesData.quality_by_rate.global_forex,
        rates: ratesData.global_forex,
      }));
      console.log("Google FX daily snapshot recorded in KV!");
    }
  } catch (err: any) {
    console.error("Error in scheduled task:", err.message);
  }
}

async function readKeyedHistory(
  kv: KVNamespace,
  prefix: string,
  legacyKey: string,
): Promise<any[]> {
  const listed = await kv.list({ prefix, limit: 1000 });
  const keyed = await Promise.all(
    listed.keys.map(async ({ name }) => {
      const value = await kv.get(name, "json");
      return value && typeof value === "object" ? value : null;
    }),
  );
  const history = keyed.filter((entry): entry is Record<string, unknown> => entry !== null);
  if (history.length > 0) {
    const maxEntries = prefix === "forex_history:" ? 60 : 1500;
    return history
      .sort((a, b) =>
        String(a.timestamp ?? a.date).localeCompare(String(b.timestamp ?? b.date)),
      )
      .slice(-maxEntries);
  }

  const legacy = await kv.get(legacyKey, "json");
  return Array.isArray(legacy) ? legacy : [];
}

async function fetchFreshRates(env: Env): Promise<any> {
  const [
    archiveResult, 
    alanchandResult, 
    navasanResult, 
    bitpinResult, 
    wallexResult,
    bonbastLiveResult,
    nobitexCheck,
    googleFxResult
  ] = await Promise.allSettled([
    fetchArchiveRates(),
    fetchAlanchandRates(),
    fetchNavasanRates(env.NAVASAN_API_KEY),
    fetchBitpinUsdt(),
    fetchWallexUsdt(),
    fetchBonbastLive(),
    fetchWithTimeout("https://api.nobitex.ir/v2/orderbook/USDTIRT", { headers: { "User-Agent": "Mozilla/5.0" } }, 4000),
    getCachedGoogleFxRates(env)
  ]);

  // Extract individual sources
  let bonbastUSD = null;
  let bonbastGBP = null;
  let bonbastMode: "live" | "archive" | null = null;
  let bonbastDate: string | null = null;

  if (bonbastLiveResult.status === "fulfilled" && bonbastLiveResult.value) {
    bonbastUSD = bonbastLiveResult.value.usd;
    bonbastGBP = bonbastLiveResult.value.gbp;
    bonbastMode = "live";
  } else {
    if (bonbastLiveResult.status === "rejected") {
      console.error("Bonbast Live fetch failed:", bonbastLiveResult.reason);
    }
    // Fallback to daily GitHub archive
    if (archiveResult.status === "fulfilled" && archiveResult.value) {
      const archiveData = archiveResult.value;
      const dates = Object.keys(archiveData).sort();
      if (dates.length > 0) {
        const latestDate = dates[dates.length - 1];
        const latestRates = archiveData[latestDate];
        if (latestRates.usd) bonbastUSD = latestRates.usd;
        if (latestRates.gbp) bonbastGBP = latestRates.gbp;
        bonbastMode = "archive";
        bonbastDate = latestDate;
      }
    }
  }

  let alanchandUSD = null;
  let alanchandGBP = null;
  if (alanchandResult.status === "fulfilled" && alanchandResult.value) {
    alanchandUSD = alanchandResult.value.usd;
    alanchandGBP = alanchandResult.value.gbp;
  } else {
    console.error("Alanchand fetch failed:", alanchandResult.status === "rejected" ? alanchandResult.reason : "Unknown error");
  }

  let navasanUSD = null;
  let navasanGBP = null;
  if (navasanResult.status === "fulfilled" && navasanResult.value) {
    navasanUSD = navasanResult.value.usd;
    navasanGBP = navasanResult.value.gbp;
  } else if (env.NAVASAN_API_KEY) {
    console.error("Navasan fetch failed:", navasanResult.status === "rejected" ? navasanResult.reason : "Unknown error");
  }

  // 1-2. Select USD and GBP rates. The fallback-chain order and source labels
  // are invariants — the logic lives in rate-selection.ts and is unit-tested.
  const usdPick = pickTomanRate(
    { bonbastMode, bonbastDate, bonbast: bonbastUSD, alanchand: alanchandUSD, navasan: navasanUSD },
    174000,
    174500
  );
  const gbpPick = pickTomanRate(
    { bonbastMode, bonbastDate, bonbast: bonbastGBP, alanchand: alanchandGBP, navasan: navasanGBP },
    231000,
    232000
  );
  const finalUsdBuy = usdPick.buy;
  const finalUsdSell = usdPick.sell;
  const usdSource = usdPick.source;
  const finalGbpBuy = gbpPick.buy;
  const finalGbpSell = gbpPick.sell;
  const gbpSource = gbpPick.source;

  // 3. Select USDT rates: Bitpin -> Wallex -> the selected USD values
  const bitpinQuote =
    bitpinResult.status === "fulfilled" && bitpinResult.value ? bitpinResult.value : null;
  const wallexQuote =
    wallexResult.status === "fulfilled" && wallexResult.value ? wallexResult.value : null;
  if (!bitpinQuote && !wallexQuote) {
    console.error("USDT fetch failed from both Bitpin and Wallex");
  }
  const usdtPick = pickUsdtRate(bitpinQuote, wallexQuote, usdPick);
  const finalUsdtBuy = usdtPick.buy;
  const finalUsdtSell = usdtPick.sell;
  const usdtSource = usdtPick.source;

  // 4. Extract Google Finance global FX rates
  let globalForex: Record<string, number> | null = null;
  let globalForexSource: string | null = null;
  let globalForexObservedAt: string | null = null;
  if (googleFxResult.status === "fulfilled" && googleFxResult.value) {
    globalForex = googleFxResult.value.rates;
    globalForexSource = googleFxResult.value.source;
    globalForexObservedAt = googleFxResult.value.observed_at;
  } else {
    console.error("Google FX fetch failed:", googleFxResult.status === "rejected" ? googleFxResult.reason : "Unknown error");
  }

  // Compile daily trends arrays for charts (used as fallback)
  let historyUSD: any[] = [];
  let historyGBP: any[] = [];
  if (archiveResult.status === "fulfilled" && archiveResult.value) {
    const archiveData = archiveResult.value;
    const dates = Object.keys(archiveData).sort();
    const last30Dates = dates.slice(-30);
    historyUSD = last30Dates.map(d => ({
      date: d,
      sell: archiveData[d].usd?.sell || finalUsdSell,
      buy: archiveData[d].usd?.buy || finalUsdBuy,
    }));
    historyGBP = last30Dates.map(d => ({
      date: d,
      sell: archiveData[d].gbp?.sell || finalGbpSell,
      buy: archiveData[d].gbp?.buy || finalGbpBuy,
    }));
  }

  const observedAt = new Date().toISOString();
  const qualityByRate: Record<string, RateQuality> = {
    USD: classifyRateQuality({ source: usdSource, observed_at: observedAt }, Date.parse(observedAt)),
    GBP: classifyRateQuality({ source: gbpSource, observed_at: observedAt }, Date.parse(observedAt)),
    USDT: classifyRateQuality({ source: usdtSource, observed_at: observedAt }, Date.parse(observedAt)),
    global_forex: classifyRateQuality(
      { source: globalForexSource, observed_at: globalForexObservedAt },
      Date.parse(observedAt),
    ),
  };
  const quality = Object.values(qualityByRate).includes("unavailable")
    ? "unavailable"
    : Object.values(qualityByRate).includes("degraded")
      ? "degraded"
      : "live";

  return {
    status: quality === "live" ? "success" : quality,
    quality,
    quality_by_rate: qualityByRate,
    timestamp: observedAt,
    rates: {
      USD: {
        source: usdSource,
        observed_at: observedAt,
        buy: finalUsdBuy,
        sell: finalUsdSell,
        unit: "Toman",
        sources: {
          alanchand: alanchandUSD ? { buy: alanchandUSD.buy, sell: alanchandUSD.sell } : null,
          bonbast: bonbastUSD ? {
            buy: bonbastUSD.buy,
            sell: bonbastUSD.sell,
            mode: bonbastMode,
            date: bonbastDate
          } : null
        }
      },
      GBP: {
        source: gbpSource,
        observed_at: observedAt,
        buy: finalGbpBuy,
        sell: finalGbpSell,
        unit: "Toman",
        sources: {
          alanchand: alanchandGBP ? { buy: alanchandGBP.buy, sell: alanchandGBP.sell } : null,
          bonbast: bonbastGBP ? {
            buy: bonbastGBP.buy,
            sell: bonbastGBP.sell,
            mode: bonbastMode,
            date: bonbastDate
          } : null
        }
      },
      USDT: {
        source: usdtSource,
        observed_at: observedAt,
        buy: finalUsdtBuy,
        sell: finalUsdtSell,
        unit: "Toman",
        sources: {
          [usdtSource]: { price: finalUsdtSell, unit: "Toman" }
        }
      },
    },
    conversions: {
      USD_TO_IRR: {
        free_market: finalUsdSell * 10,
      },
      IRR_TO_USD: {
        free_market: parseFloat((1 / (finalUsdSell * 10)).toFixed(12)),
      },
      USD_TO_TMN: {
        free_market: finalUsdSell,
      },
      TMN_TO_USD: {
        free_market: parseFloat((1 / finalUsdSell).toFixed(12)),
      },
      GBP_TO_IRR: {
        free_market: finalGbpSell * 10,
      },
      IRR_TO_GBP: {
        free_market: parseFloat((1 / (finalGbpSell * 10)).toFixed(12)),
      },
      USDT_TO_IRR: {
        free_market: finalUsdtSell * 10,
      },
      IRR_TO_USDT: {
        free_market: parseFloat((1 / (finalUsdtSell * 10)).toFixed(12)),
      },
    },
    history_30d: {
      USD: historyUSD,
      GBP: historyGBP,
    },
    connections: {
      "Bonbast (Live)": bonbastLiveResult.status === "fulfilled",
      "Bonbast (Archive)": archiveResult.status === "fulfilled",
      "Alanchand": alanchandResult.status === "fulfilled",
      "Navasan": navasanResult.status === "fulfilled",
      "Bitpin": bitpinResult.status === "fulfilled",
      "Wallex": wallexResult.status === "fulfilled",
      "Nobitex": nobitexCheck.status === "fulfilled" && nobitexCheck.value.status === 200,
      "Google Finance": globalForex !== null && Object.keys(globalForex).length > 0
    },
    global_forex: globalForex,
    global_forex_source: globalForexSource,
    global_forex_observed_at: globalForexObservedAt,
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

async function fetchAlanchandRates(): Promise<{ usd: { buy: number; sell: number }; gbp: { buy: number; sell: number } }> {
  const response = await fetchWithTimeout("https://alanchand.com/", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
  }, 6000);
  if (!response.ok) throw new Error(`Alanchand HTTP status: ${response.status}`);
  const html = await response.text();

  const parseRow = (currency: string) => {
    const regex = new RegExp(`currencies-price\\/${currency}'[\\s\\S]*?<\\/tr>`, "i");
    const match = html.match(regex);
    if (!match) throw new Error(`Row for ${currency} not found on Alanchand`);
    
    const rowHtml = match[0];
    const buyMatch = rowHtml.match(/class="buyPrice[^>]*>\s*([\u06F0-\u06F90-9,]+)/i);
    const sellMatch = rowHtml.match(/class="sellPrice[^>]*>\s*([\u06F0-\u06F90-9,]+)/i);
    
    if (!buyMatch || !sellMatch) throw new Error(`Rates for ${currency} not found on Alanchand`);
    return {
      buy: parsePersianPrice(buyMatch[1]),
      sell: parsePersianPrice(sellMatch[1])
    };
  };

  return {
    usd: parseRow("usd"),
    gbp: parseRow("gbp")
  };
}

async function fetchNavasanRates(apiKey?: string): Promise<{ usd: { buy: number; sell: number }; gbp: { buy: number; sell: number } }> {
  if (!apiKey) throw new Error("Navasan API key missing");
  const response = await fetchWithTimeout(`https://api.navasan.tech/latest/?api_key=${apiKey}`, {}, 5000);
  if (!response.ok) throw new Error(`Navasan HTTP status: ${response.status}`);
  const data: any = await response.json();

  const getVal = (obj: any) => {
    if (!obj) return 0;
    const valStr = obj.value || obj;
    return Math.round(parseFloat(valStr.toString().replace(/,/g, "")));
  };

  const usdBuy = getVal(data.usd_buy);
  const usdSell = getVal(data.usd_sell);
  const gbpVal = getVal(data.gbp_sell || data.gbp_buy || data.gbp);

  return {
    usd: { buy: usdBuy || usdSell, sell: usdSell || usdBuy },
    gbp: { buy: gbpVal, sell: gbpVal },
  };
}

async function fetchBitpinUsdt(): Promise<{ buy: number; sell: number }> {
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
  
  const price = Math.round(parseFloat(usdtIrt.price));
  // Bitpin does not provide separate bid/ask spread in the markets list, so buy == sell == last price.
  return { buy: price, sell: price };
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

async function fetchBonbastLive(): Promise<{ usd: { buy: number; sell: number }; gbp: { buy: number; sell: number } }> {
  const ua = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  const cookie = "cookieconsent_status=true; st_bb=0";

  const attempt = async (host: string) => {
    // Step A: GET the home page
    const getRes = await fetchWithTimeout(
      `https://${host}/`,
      {
        headers: {
          "User-Agent": ua,
          "Cookie": cookie,
          "Referer": `https://${host}/`,
        },
      },
      6000
    );
    if (!getRes.ok) {
      throw new Error(`Failed to GET ${host}: ${getRes.status}`);
    }
    const html = await getRes.text();

    // Step B: Extract token from the HTML
    const match = html.match(/param\s*[=:]\s*"([^"]+)"/m);
    if (!match) {
      throw new Error(`Token param not found in ${host} HTML`);
    }
    const token = match[1];

    // Step C: POST to /json
    const postRes = await fetchWithTimeout(
      `https://${host}/json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Origin": `https://${host}`,
          "Referer": `https://${host}/`,
          "Cookie": cookie,
          "User-Agent": ua,
        },
        body: "param=" + encodeURIComponent(token),
      },
      6000
    );
    if (!postRes.ok) {
      throw new Error(`Failed to POST to ${host}/json: ${postRes.status}`);
    }
    const data: any = await postRes.json();

    // Step D: Parse JSON response
    if (data && data.reset) {
      throw new Error(`Token rejected by ${host} (reset response)`);
    }

    const usdSell = parseInt(data?.usd1);
    const usdBuy = parseInt(data?.usd2);
    const gbpSell = parseInt(data?.gbp1);
    const gbpBuy = parseInt(data?.gbp2);

    if (isNaN(usdSell) || usdSell === 0 || isNaN(usdBuy) || usdBuy === 0 ||
        isNaN(gbpSell) || gbpSell === 0 || isNaN(gbpBuy) || gbpBuy === 0) {
      throw new Error(`Invalid rates parsed from ${host} JSON response`);
    }

    return {
      usd: { buy: usdBuy, sell: usdSell },
      gbp: { buy: gbpBuy, sell: gbpSell },
    };
  };

  try {
    return await attempt("bonbast.com");
  } catch (error: any) {
    console.warn(`Primary Bonbast scrape failed: ${error.message}. Retrying on mirror...`);
    return await attempt("www.bon-bast.com");
  }
}

async function getCachedGoogleFxRates(env: Env): Promise<GoogleFxCacheData> {
  const now = Date.now();
  if (inMemoryGoogleFxCache && now - inMemoryGoogleFxCache.timestamp < GOOGLE_FX_CACHE_TTL) {
    return inMemoryGoogleFxCache.data;
  }

  if (env.KV) {
    const cachedStr = await env.KV.get("google_fx_rates");
    if (cachedStr) {
      try {
        const cached = JSON.parse(cachedStr);
        if (cached.timestamp && (now - new Date(cached.timestamp).getTime()) < GOOGLE_FX_CACHE_TTL) {
          return {
            rates: cached.rates ?? {},
            source: cached.source ?? "Google Finance (cached)",
            observed_at: cached.observed_at ?? cached.timestamp,
          };
        }
      } catch (e) {
        // Ignore parsing error and fetch fresh
      }
    }
  }

  const fetched = await fetchGoogleFinanceRates();
  const observedAt = new Date().toISOString();
  const data: GoogleFxCacheData = {
    rates: fetched.rates,
    source: fetched.source,
    observed_at: observedAt,
  };
  if (env.KV) {
    await env.KV.put("google_fx_rates", JSON.stringify({
      timestamp: observedAt,
      ...data,
    }));
  }
  inMemoryGoogleFxCache = {
    data,
    timestamp: now,
  };
  return data;
}

async function fetchGoogleFinanceRates(): Promise<{
  rates: Record<string, number>;
  source: string;
}> {
  const basePairs = [
    { from: "EUR", to: "USD" },
    { from: "GBP", to: "USD" },
    { from: "EUR", to: "GBP" },
  ];

  const results = await Promise.allSettled(
    basePairs.map(pair => fetchGoogleFinanceRate(pair.from, pair.to))
  );

  const rates: Record<string, number> = {};

  const eurUsd = results[0].status === "fulfilled" ? results[0].value.rate : 0;
  const gbpUsd = results[1].status === "fulfilled" ? results[1].value.rate : 0;
  const eurGbp = results[2].status === "fulfilled" ? results[2].value.rate : 0;

  if (eurUsd > 0) {
    rates["EUR/USD"] = roundFx(eurUsd);
    rates["USD/EUR"] = roundFx(1 / eurUsd);
  }
  if (gbpUsd > 0) {
    rates["GBP/USD"] = roundFx(gbpUsd);
    rates["USD/GBP"] = roundFx(1 / gbpUsd);
  }
  if (eurGbp > 0) {
    rates["EUR/GBP"] = roundFx(eurGbp);
    rates["GBP/EUR"] = roundFx(1 / eurGbp);
  }

  // Log failures
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`Google Finance ${basePairs[i].from}/${basePairs[i].to} failed:`, r.reason);
    }
  });

  let source = "Google Finance";

  // Fallback to public FX API if any base pair is missing
  if (!rates["EUR/USD"] || !rates["GBP/USD"] || !rates["EUR/GBP"]) {
    console.warn("Google Finance rates incomplete, falling back to public FX API");
    const fallbackRates = await fetchFallbackFxRates();
    source = "Google Finance + Fallback API";
    for (const [pair, rate] of Object.entries(fallbackRates)) {
      if (!rates[pair]) {
        rates[pair] = rate;
      }
    }
  }

  return { rates, source };
}

async function fetchFallbackFxRates(): Promise<Record<string, number>> {
  try {
    const response = await fetchWithTimeout("https://open.er-api.com/v6/latest/USD", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VaraFX/1.0.0",
      },
    }, 6000);

    if (!response.ok) throw new Error(`Fallback API HTTP ${response.status}`);

    const data: any = await response.json();
    if (!data || !data.rates) throw new Error("Fallback API returned invalid data");

    const { EUR, GBP } = data.rates;
    if (!EUR || !GBP) throw new Error("Fallback API missing EUR or GBP rates");

    const eurUsd = 1 / EUR;  // USD base: 1 USD = X EUR, so EUR/USD = 1/X
    const gbpUsd = 1 / GBP;  // USD base: 1 USD = X GBP, so GBP/USD = 1/X
    const eurGbp = EUR / GBP;

    return {
      "EUR/USD": roundFx(eurUsd),
      "USD/EUR": roundFx(1 / eurUsd),
      "GBP/USD": roundFx(gbpUsd),
      "USD/GBP": roundFx(1 / gbpUsd),
      "EUR/GBP": roundFx(eurGbp),
      "GBP/EUR": roundFx(1 / eurGbp),
    };
  } catch (err: any) {
    console.error("Fallback FX API failed:", err.message);
    return {};
  }
}

async function fetchGoogleFinanceRate(from: string, to: string): Promise<GoogleFxRate> {
  const url = `https://www.google.com/finance/quote/${from}-${to}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "sec-ch-ua": "\"Not/A)Brand\";v=\"99\", \"Google Chrome\";v=\"120\", \"Chromium\";v=\"120\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "Cookie": "CONSENT=YES+cb; SOCS=CAESEwgDEgk0ODE3Nzk3MjcaAmVuIAEaBgiAqafJBg",
    },
  }, 8000);

  if (!response.ok) {
    throw new Error(`Google Finance ${from}-${to} HTTP ${response.status}`);
  }

  const html = await response.text();
  const parsed = extractGoogleFinanceRate(html, from, to);
  if (!parsed) {
    throw new Error(`Could not parse rate for ${from}/${to}`);
  }
  return parsed;
}

function roundFx(value: number): number {
  return parseFloat(value.toFixed(6));
}
