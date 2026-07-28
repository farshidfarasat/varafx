import { dashboardHtml } from "./dashboard";

interface Env {
  KV?: KVNamespace;
  NAVASAN_API_KEY?: string;
}

interface CacheStore {
  data: any;
  timestamp: number;
}

interface GoogleFxRate {
  pair: string;
  rate: number;
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
          const historyStr = await env.KV.get("rates_history");
          if (historyStr) {
            history = JSON.parse(historyStr);
          }
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
  console.log("Scheduled cron running...");
  try {
    const ratesData = await fetchFreshRates(env);
    
    // Save latest rates
    if (env.KV) {
      await env.KV.put("rates_latest", JSON.stringify(ratesData));
    }

    // Record historical data points at 10:30, 13:30, 15:30, 17:30 Iran Time
    if (isHistoryRecordTime() && env.KV) {
      const historyStr = await env.KV.get("rates_history");
      let history: any[] = [];
      if (historyStr) {
        history = JSON.parse(historyStr);
      }

      const historyEntry = {
        timestamp: new Date().toISOString(),
        usd: ratesData.rates.USD,
        gbp: ratesData.rates.GBP,
        usdt: ratesData.rates.USDT,
      };

      history.push(historyEntry);

      // Keep only 12 months of history (4 data points per day * 365 = 1460, let's keep 1500)
      history = history.slice(-1500);

      await env.KV.put("rates_history", JSON.stringify(history));
      console.log("Historical entry recorded in KV!");
    }
  } catch (err: any) {
    console.error("Error in scheduled task:", err.message);
  }
}

function isHistoryRecordTime(): boolean {
  // Iran Standard Time (IRST) is UTC+3:30
  const iranTime = new Date(Date.now() + 3.5 * 60 * 60 * 1000);
  const hour = iranTime.getUTCHours();
  const min = iranTime.getUTCMinutes();
  
  // We record at local times: 10:30, 13:30, 15:30, 17:30
  // Schedulers can skew by a few minutes, we check if minutes fall between 25 and 35
  const isTargetHour = [10, 13, 15, 17].includes(hour);
  const isTargetMinute = min >= 25 && min <= 35;
  
  return isTargetHour && isTargetMinute;
}

function compileFallbackHistory(latestData: any): any[] {
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

  // 1. Select USD rates: Bonbast (Live) -> AlanChand -> Navasan -> Bonbast (Archive) -> Fallback
  let finalUsdBuy = 174000;
  let finalUsdSell = 174500;
  let usdSource = "Fallback";

  if (bonbastMode === "live" && bonbastUSD) {
    finalUsdBuy = bonbastUSD.buy;
    finalUsdSell = bonbastUSD.sell;
    usdSource = "Bonbast (Live)";
  } else if (alanchandUSD) {
    finalUsdBuy = alanchandUSD.buy;
    finalUsdSell = alanchandUSD.sell;
    usdSource = "AlanChand";
  } else if (navasanUSD) {
    finalUsdBuy = navasanUSD.buy;
    finalUsdSell = navasanUSD.sell;
    usdSource = "Navasan";
  } else if (bonbastMode === "archive" && bonbastUSD) {
    finalUsdBuy = bonbastUSD.buy;
    finalUsdSell = bonbastUSD.sell;
    usdSource = bonbastDate ? `Bonbast (Archive ${bonbastDate})` : "Bonbast (Archive)";
  }

  // 2. Select GBP rates: Bonbast (Live) -> AlanChand -> Navasan -> Bonbast (Archive) -> Fallback
  let finalGbpBuy = 231000;
  let finalGbpSell = 232000;
  let gbpSource = "Fallback";

  if (bonbastMode === "live" && bonbastGBP) {
    finalGbpBuy = bonbastGBP.buy;
    finalGbpSell = bonbastGBP.sell;
    gbpSource = "Bonbast (Live)";
  } else if (alanchandGBP) {
    finalGbpBuy = alanchandGBP.buy;
    finalGbpSell = alanchandGBP.sell;
    gbpSource = "AlanChand";
  } else if (navasanGBP) {
    finalGbpBuy = navasanGBP.buy;
    finalGbpSell = navasanGBP.sell;
    gbpSource = "Navasan";
  } else if (bonbastMode === "archive" && bonbastGBP) {
    finalGbpBuy = bonbastGBP.buy;
    finalGbpSell = bonbastGBP.sell;
    gbpSource = bonbastDate ? `Bonbast (Archive ${bonbastDate})` : "Bonbast (Archive)";
  }

  // 3. Select USDT rates
  let finalUsdtBuy = finalUsdBuy;
  let finalUsdtSell = finalUsdSell;
  let usdtSource = "Fallback";

  if (bitpinResult.status === "fulfilled" && bitpinResult.value) {
    finalUsdtBuy = bitpinResult.value.buy;
    finalUsdtSell = bitpinResult.value.sell;
    usdtSource = "Bitpin";
  } else if (wallexResult.status === "fulfilled" && wallexResult.value) {
    finalUsdtBuy = wallexResult.value.bid;
    finalUsdtSell = wallexResult.value.ask;
    usdtSource = "Wallex";
  } else {
    console.error("USDT fetch failed from both Bitpin and Wallex");
  }

  // 4. Extract Google Finance global FX rates
  let globalForex: Record<string, number> | null = null;
  if (googleFxResult.status === "fulfilled" && googleFxResult.value) {
    globalForex = googleFxResult.value;
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

  return {
    status: "success",
    timestamp: new Date().toISOString(),
    rates: {
      USD: {
        source: usdSource,
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
      "Nobitex": nobitexCheck.status === "fulfilled" && nobitexCheck.value.status === 200
    },
    global_forex: globalForex,
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

function parsePersianPrice(str: string): number {
  const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
  let englishStr = str.replace(/,/g, "").trim();
  for (let i = 0; i < 10; i++) {
    englishStr = englishStr.replace(persianDigits[i], i.toString());
  }
  return parseInt(englishStr);
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

async function getCachedGoogleFxRates(env: Env): Promise<Record<string, number>> {
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
          return cached.rates;
        }
      } catch (e) {
        // Ignore parsing error and fetch fresh
      }
    }
  }

  const rates = await fetchGoogleFinanceRates();
  if (env.KV) {
    await env.KV.put("google_fx_rates", JSON.stringify({
      timestamp: new Date().toISOString(),
      rates,
    }));
  }
  inMemoryGoogleFxCache = {
    data: rates,
    timestamp: now,
  };
  return rates;
}

async function fetchGoogleFinanceRates(): Promise<Record<string, number>> {
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

  return rates;
}

async function fetchGoogleFinanceRate(from: string, to: string): Promise<GoogleFxRate> {
  const url = `https://www.google.com/finance/quote/${from}-${to}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Cookie": "CONSENT=YES+cb",
    },
  }, 8000);

  if (!response.ok) {
    throw new Error(`Google Finance ${from}-${to} HTTP ${response.status}`);
  }

  const html = await response.text();

  // Pattern 1: data-last-price attribute
  let match = html.match(/data-last-price="([^"]+)"/);
  if (match) {
    return { pair: `${from}/${to}`, rate: parseFloat(match[1]) };
  }

  // Pattern 2: YMlKec fxKbKc class (main price display)
  match = html.match(/class="YMlKec fxKbKc"[^>]*>([\d.,]+)</);
  if (match) {
    return { pair: `${from}/${to}`, rate: parseFloat(match[1].replace(/,/g, "")) };
  }

  // Pattern 3: PZPZlf class price element
  match = html.match(/data-last-price="([^"]*)"|class="[^"]*kf1m0[^"]*"[^>]*>([\d.,]+)</);
  if (match) {
    const val = match[1] || match[2];
    if (val) return { pair: `${from}/${to}`, rate: parseFloat(val.replace(/,/g, "")) };
  }

  // Pattern 4: Look for embedded JSON data (AF_initDataCallback)
  const jsonMatch = html.match(/AF_initDataCallback\(\{key:\s*'ds:5'[\s\S]*?data:(\[[\s\S]*?\])\s*\}\);/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      // Navigate to find the price (structure varies)
      const price = extractPriceFromGoogleData(data);
      if (price > 0) return { pair: `${from}/${to}`, rate: price };
    } catch (e) {
      // Fall through to next pattern
    }
  }

  // Pattern 5: Title tag often contains the rate
  const titleMatch = html.match(/<title>([\d.,]+)\s/);
  if (titleMatch) {
    const val = parseFloat(titleMatch[1].replace(/,/g, ""));
    if (!isNaN(val) && val > 0) {
      return { pair: `${from}/${to}`, rate: val };
    }
  }

  throw new Error(`Could not parse rate for ${from}/${to}`);
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
            if (Array.isArray(sub)) {
              for (const s of sub) {
                if (typeof s === "number" && s > 0 && s < 1000) {
                  return s;
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    // Ignore
  }
  return 0;
}

function roundFx(value: number): number {
  return parseFloat(value.toFixed(4));
}
