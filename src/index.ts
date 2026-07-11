import { dashboardHtml } from "./dashboard";

interface CacheStore {
  data: any;
  timestamp: number;
}

let inMemoryCache: CacheStore | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
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

  async scheduled(event: any, env: any, ctx: any): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};

async function getCachedRates(env: any): Promise<any> {
  if (env.KV) {
    const cachedStr = await env.KV.get("rates_latest");
    if (cachedStr) {
      try {
        const cached = JSON.parse(cachedStr);
        if (cached.timestamp && (Date.now() - new Date(cached.timestamp).getTime()) < CACHE_TTL) {
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

async function handleScheduled(env: any): Promise<void> {
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
  if (!latestData || !latestData.history_7d) return [];
  const usdHistory = latestData.history_7d.USD || [];
  const gbpHistory = latestData.history_7d.GBP || [];
  
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

async function fetchFreshRates(env: any): Promise<any> {
  const [archiveResult, alanchandResult, navasanResult, bitpinResult, wallexResult] = 
    await Promise.allSettled([
      fetchArchiveRates(),
      fetchAlanchandRates(),
      fetchNavasanRates(env.NAVASAN_API_KEY),
      fetchBitpinUsdt(),
      fetchWallexUsdt(),
    ]);

  // Extract individual sources
  let bonbastUSD = null;
  let bonbastGBP = null;
  if (archiveResult.status === "fulfilled" && archiveResult.value) {
    const archiveData = archiveResult.value;
    const dates = Object.keys(archiveData).sort();
    if (dates.length > 0) {
      const latestDate = dates[dates.length - 1];
      const latestRates = archiveData[latestDate];
      if (latestRates.usd) bonbastUSD = latestRates.usd;
      if (latestRates.gbp) bonbastGBP = latestRates.gbp;
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

  // 1. Select USD rates
  let finalUsdBuy = 174000;
  let finalUsdSell = 174500;
  let usdSource = "Fallback";

  if (alanchandUSD) {
    finalUsdBuy = alanchandUSD.buy;
    finalUsdSell = alanchandUSD.sell;
    usdSource = "AlanChand";
  } else if (navasanUSD) {
    finalUsdBuy = navasanUSD.buy;
    finalUsdSell = navasanUSD.sell;
    usdSource = "Navasan";
  } else if (bonbastUSD) {
    finalUsdBuy = bonbastUSD.buy;
    finalUsdSell = bonbastUSD.sell;
    usdSource = "Bonbast";
  }

  // 2. Select GBP rates
  let finalGbpBuy = 231000;
  let finalGbpSell = 232000;
  let gbpSource = "Fallback";

  if (alanchandGBP) {
    finalGbpBuy = alanchandGBP.buy;
    finalGbpSell = alanchandGBP.sell;
    gbpSource = "AlanChand";
  } else if (navasanGBP) {
    finalGbpBuy = navasanGBP.buy;
    finalGbpSell = navasanGBP.sell;
    gbpSource = "Navasan";
  } else if (bonbastGBP) {
    finalGbpBuy = bonbastGBP.buy;
    finalGbpSell = bonbastGBP.sell;
    gbpSource = "Bonbast";
  }

  // 3. Select USDT rates
  let finalUsdtBuy = finalUsdBuy;
  let finalUsdtSell = finalUsdSell;
  let usdtSource = "Fallback";

  if (bitpinResult.status === "fulfilled" && bitpinResult.value) {
    finalUsdtBuy = bitpinResult.value;
    finalUsdtSell = bitpinResult.value;
    usdtSource = "Bitpin";
  } else if (wallexResult.status === "fulfilled" && wallexResult.value) {
    finalUsdtBuy = wallexResult.value.bid;
    finalUsdtSell = wallexResult.value.ask;
    usdtSource = "Wallex";
  } else {
    console.error("USDT fetch failed from both Bitpin and Wallex");
  }

  // Compile daily trends arrays for charts (used as fallback)
  let historyUSD: any[] = [];
  let historyGBP: any[] = [];
  if (archiveResult.status === "fulfilled" && archiveResult.value) {
    const archiveData = archiveResult.value;
    const dates = Object.keys(archiveData).sort();
    const last7Dates = dates.slice(-7);
    historyUSD = last7Dates.map(d => ({
      date: d,
      sell: archiveData[d].usd?.sell || finalUsdSell,
      buy: archiveData[d].usd?.buy || finalUsdBuy,
    }));
    historyGBP = last7Dates.map(d => ({
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
      },
      GBP: {
        source: gbpSource,
        buy: finalGbpBuy,
        sell: finalGbpSell,
        unit: "Toman",
      },
      USDT: {
        source: usdtSource,
        buy: finalUsdtBuy,
        sell: finalUsdtSell,
        unit: "Toman",
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


