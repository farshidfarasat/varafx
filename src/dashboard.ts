export const dashboardHtml = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VaraFX - Real-time IRR/Toman Exchange Rates</title>
  <meta name="description" content="Live free-market and official exchange rates for USD, GBP, and USDT to Iranian Rial (IRR) and Toman.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Vazirmatn:wght@300;400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #090a0f;
      --bg-card: rgba(17, 19, 31, 0.65);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-primary: #f3f4f6;
      --text-secondary: #9ca3af;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --accent-gradient: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
      --accent-green: #10b981;
      --accent-red: #ef4444;
      --accent-blue: #3b82f6;
      --font-en: 'Outfit', sans-serif;
      --font-fa: 'Vazirmatn', sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      transition: background-color 0.3s, border-color 0.3s;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-primary);
      font-family: var(--font-en);
      min-height: 100vh;
      overflow-x: hidden;
      position: relative;
    }

    /* Background glows */
    body::before {
      content: '';
      position: absolute;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
      top: -100px;
      left: -100px;
      z-index: -1;
      pointer-events: none;
    }

    body::after {
      content: '';
      position: absolute;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, transparent 70%);
      bottom: -150px;
      right: -150px;
      z-index: -1;
      pointer-events: none;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2.5rem;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 1.5rem;
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-icon {
      width: 2.5rem;
      height: 2.5rem;
      background: var(--accent-gradient);
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.25rem;
      color: white;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
    }

    .logo-text h1 {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      background: var(--accent-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .logo-text p {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .lang-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      cursor: pointer;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .lang-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Grid layout */
    .dashboard-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 2rem;
      margin-bottom: 2.5rem;
    }

    @media (max-width: 900px) {
      .dashboard-grid {
        grid-template-columns: 1fr;
      }
    }

    .glass-card {
      background: var(--bg-card);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 1.25rem;
      padding: 1.75rem;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
      position: relative;
      overflow: hidden;
    }

    .card-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Rate table styling */
    .rates-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    .rates-table th, .rates-table td {
      padding: 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }

    .rates-table th {
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .rates-table tr:last-child td {
      border-bottom: none;
    }

    .currency-cell {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 600;
    }

    .flag-icon {
      font-size: 1.5rem;
      line-height: 1;
    }

    .price-val {
      font-family: var(--font-en);
      font-weight: 600;
      font-size: 1.1rem;
    }

    .price-sub {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-top: 0.15rem;
    }

    .badge {
      padding: 0.25rem 0.5rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-market {
      background: rgba(99, 102, 241, 0.15);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }

    .badge-official {
      background: rgba(59, 130, 246, 0.15);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    /* USDT Sources styling */
    .source-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-top: 0.75rem;
    }

    .source-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 0.75rem;
    }

    .source-name {
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .source-dot {
      width: 6px;
      height: 6px;
      background-color: var(--accent-green);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--accent-green);
    }

    /* Calculator styling */
    .calc-group {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .calc-input-wrapper {
      position: relative;
    }

    .calc-input {
      width: 100%;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 1rem 1rem 1rem 3.5rem;
      border-radius: 0.75rem;
      font-size: 1.1rem;
      font-weight: 600;
      font-family: var(--font-en);
      outline: none;
    }

    .calc-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
    }

    .calc-currency-select {
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-primary);
      padding: 0.35rem 0.5rem;
      border-radius: 0.5rem;
      font-weight: 600;
      cursor: pointer;
      outline: none;
    }

    .calc-currency-label {
      position: absolute;
      right: 1rem;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.875rem;
      color: var(--text-secondary);
      pointer-events: none;
    }

    .calc-arrow {
      align-self: center;
      font-size: 1.5rem;
      color: var(--text-secondary);
      margin: -0.25rem 0;
    }

    /* Charts Section */
    .charts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      margin-bottom: 2.5rem;
    }

    @media (max-width: 768px) {
      .charts-grid {
        grid-template-columns: 1fr;
      }
    }

    .chart-container {
      height: 200px;
      position: relative;
      margin-top: 1rem;
      display: flex;
      align-items: flex-end;
    }

    .chart-svg {
      width: 100%;
      height: 100%;
    }

    .chart-line {
      fill: none;
      stroke: var(--accent);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .chart-line-gbp {
      stroke: #a855f7;
    }

    .chart-area {
      fill: url(#chart-gradient);
      opacity: 0.15;
    }

    .chart-area-gbp {
      fill: url(#chart-gradient-gbp);
      opacity: 0.15;
    }

    .chart-grid-line {
      stroke: rgba(255, 255, 255, 0.04);
      stroke-width: 1;
    }

    .chart-axis-text {
      fill: var(--text-secondary);
      font-size: 10px;
      font-family: var(--font-en);
    }

    .chart-tooltip {
      position: absolute;
      background: #11131f;
      border: 1px solid var(--border-color);
      border-radius: 0.5rem;
      padding: 0.5rem;
      font-size: 0.75rem;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
    }

    /* API Docs section */
    .api-section {
      margin-bottom: 2.5rem;
    }

    .code-block {
      background: #0f111a;
      border: 1px solid var(--border-color);
      border-radius: 0.75rem;
      padding: 1.25rem;
      font-family: monospace;
      font-size: 0.9rem;
      overflow-x: auto;
      position: relative;
      color: #38bdf8;
    }

    .copy-btn {
      position: absolute;
      right: 0.75rem;
      top: 0.75rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 0.35rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      cursor: pointer;
    }

    .copy-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    /* Farsi RTL support */
    [lang="fa"] body {
      font-family: var(--font-fa);
      direction: rtl;
      text-align: right;
    }

    [lang="fa"] .rates-table {
      text-align: right;
    }

    [lang="fa"] .calc-input {
      padding: 1rem 3.5rem 1rem 1rem;
    }

    [lang="fa"] .calc-currency-select {
      left: auto;
      right: 0.75rem;
    }

    [lang="fa"] .calc-currency-label {
      right: auto;
      left: 1rem;
    }

    [lang="fa"] .copy-btn {
      right: auto;
      left: 0.75rem;
    }

    /* Loading overlay */
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--bg-dark);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      transition: opacity 0.5s ease, visibility 0.5s;
    }

    .spinner {
      width: 3.5rem;
      height: 3.5rem;
      border: 4px solid rgba(99, 102, 241, 0.1);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1.5rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .hidden {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    .last-updated {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-top: 0.5rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="loading-overlay" id="loading">
    <div class="spinner"></div>
    <h2 id="loading-text" style="font-weight: 500;">Loading live market rates...</h2>
  </div>

  <div class="container">
    <header>
      <div class="logo-container">
        <div class="logo-icon">💱</div>
        <div class="logo-text">
          <h1 id="nav-title">VaraFX</h1>
          <p id="nav-subtitle">Live IRR & Toman Rates Aggregator</p>
        </div>
      </div>
      <div class="controls">
        <button class="lang-btn" onclick="toggleLanguage()" id="lang-btn">
          🌐 En / فارسی
        </button>
      </div>
    </header>

    <div class="dashboard-grid">
      <!-- Rates Table Card -->
      <div class="glass-card">
        <div class="card-title">
          <span id="title-rates">Aggregated Exchange Rates</span>
          <span class="badge badge-market" id="badge-live">LIVE UPDATING</span>
        </div>
        <div style="overflow-x: auto;">
          <table class="rates-table">
            <thead>
              <tr>
                <th id="th-currency">Currency</th>
                <th id="th-type">Rate Type</th>
                <th id="th-buy">Buy Rate</th>
                <th id="th-sell">Sell Rate</th>
                <th id="th-source">Primary Source</th>
              </tr>
            </thead>
            <tbody id="rates-tbody">
              <!-- Rates populated by JS -->
            </tbody>
          </table>
        </div>
        <p class="last-updated" id="last-updated-text">Aggregated just now</p>
      </div>

      <!-- Live Converter Card -->
      <div class="glass-card">
        <div class="card-title" id="title-converter">Currency Converter</div>
        <div class="calc-group">
          <div class="calc-input-wrapper">
            <input type="number" class="calc-input" id="calc-source-val" value="1" oninput="calculateConversion()">
            <select class="calc-currency-select" id="calc-source-curr" onchange="calculateConversion()">
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="USDT">USDT</option>
              <option value="TMN">TMN</option>
              <option value="IRR">IRR</option>
            </select>
            <span class="calc-currency-label" id="label-from">From</span>
          </div>

          <div class="calc-arrow">↓</div>

          <div class="calc-input-wrapper">
            <input type="text" class="calc-input" id="calc-target-val" readonly>
            <select class="calc-currency-select" id="calc-target-curr" onchange="calculateConversion()">
              <option value="TMN" selected>TMN</option>
              <option value="IRR">IRR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="USDT">USDT</option>
            </select>
            <span class="calc-currency-label" id="label-to">To</span>
          </div>
          
          <div style="margin-top: 0.5rem;">
            <div class="card-title" id="title-usdt-sources" style="font-size: 1rem; margin-bottom: 0.5rem;">USDT Sources</div>
            <div class="source-list" id="usdt-sources-list">
              <!-- USDT Sources populated by JS -->
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="charts-grid">
      <div class="glass-card">
        <div class="card-title" id="title-usd-chart">USD Free Market Trend (7 Days)</div>
        <div class="chart-container" id="usd-chart-container">
          <!-- SVG line chart populated by JS -->
        </div>
      </div>
      <div class="glass-card">
        <div class="card-title" id="title-gbp-chart">GBP Free Market Trend (7 Days)</div>
        <div class="chart-container" id="gbp-chart-container">
          <!-- SVG line chart populated by JS -->
        </div>
      </div>
    </div>

    <!-- API Docs Section -->
    <div class="glass-card api-section">
      <div class="card-title" id="title-api-docs">Developer API Documentation</div>
      <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.9rem;" id="api-docs-desc">
        Integrate our aggregated exchange rate feed into your own services. The endpoint returns JSON containing aggregated live market rates, central bank official rates, bidirectional conversions, and 7-day historical pricing.
      </p>
      <div class="code-block" id="api-url-block">
        <button class="copy-btn" onclick="copyApiUrl()" id="copy-btn">Copy URL</button>
        <span style="color: #6366f1;">GET</span> <span id="api-endpoint-text">https://varafx.workers.dev/api/rates</span>
      </div>
    </div>
  </div>

  <script>
    let currentLang = 'en';
    let apiData = null;

    const dictionary = {
      en: {
        loading: "Loading live market rates...",
        navTitle: "VaraFX",
        navSubtitle: "Live IRR & Toman Rates Aggregator",
        thCurrency: "Currency",
        thType: "Rate Type",
        thBuy: "Buy Rate",
        thSell: "Sell Rate",
        thSource: "Primary Source",
        titleRates: "Aggregated Exchange Rates",
        titleConverter: "Currency Converter",
        titleUsdtSources: "USDT Exchanges",
        labelFrom: "From",
        labelTo: "To",
        titleUsdChart: "USD Free Market Trend (7 Days)",
        titleGbpChart: "GBP Free Market Trend (7 Days)",
        titleApiDocs: "Developer API Documentation",
        apiDocsDesc: "Integrate our aggregated exchange rate feed into your own services. The endpoint returns JSON containing aggregated live market rates, central bank official rates, bidirectional conversions, and 7-day historical pricing.",
        copyBtn: "Copy URL",
        copied: "Copied!",
        freeMarket: "Free Market",
        officialRate: "Official Central Bank",
        toman: "Toman",
        rial: "Rial",
        lastUpdated: "Last Aggregated: ",
        errorLoading: "Failed to load exchange rates. Please refresh."
      },
      fa: {
        loading: "در حال دریافت قیمت‌های لحظه‌ای بازار...",
        navTitle: "وارا اف‌ایکس (VaraFX)",
        navSubtitle: "مرجع میانگین قیمت دلار، پوند و تتر به ریال و تومان",
        thCurrency: "ارز",
        thType: "نوع نرخ",
        thBuy: "خرید از شما",
        thSell: "فروش به شما",
        thSource: "منبع اصلی",
        titleRates: "نرخ‌های ترکیب‌شده ارزها",
        titleConverter: "مبدل پیشرفته ارز",
        titleUsdtSources: "صرافی‌های تتر",
        labelFrom: "از",
        labelTo: "به",
        titleUsdChart: "نمودار قیمت دلار بازار آزاد (۷ روز گذشته)",
        titleGbpChart: "نمودار قیمت پوند بازار آزاد (۷ روز گذشته)",
        titleApiDocs: "مستندات ای‌پی‌آی (API) توسعه‌دهندگان",
        apiDocsDesc: "از اطلاعات نرخ‌های لحظه‌ای و ترکیب‌شده ما در نرم‌افزارها و پروژه‌های خود استفاده کنید. خروجی این بخش به فرمت استاندارد JSON است و شامل نرخ‌های آزاد، نرخ دولتی بانک مرکزی و آرشیو ۷ روزه می‌باشد.",
        copyBtn: "کپی آدرس",
        copied: "کپی شد!",
        freeMarket: "بازار آزاد",
        officialRate: "بانک مرکزی (دولتی)",
        toman: "تومان",
        rial: "ریال",
        lastUpdated: "آخرین بروزرسانی: ",
        errorLoading: "خطا در بارگذاری اطلاعات. لطفا صفحه را مجدداً بارگذاری کنید."
      }
    };

    function toggleLanguage() {
      currentLang = currentLang === 'en' ? 'fa' : 'en';
      document.documentElement.lang = currentLang;
      document.documentElement.dir = currentLang === 'fa' ? 'rtl' : 'ltr';
      applyTranslations();
    }

    function applyTranslations() {
      const t = dictionary[currentLang];
      
      document.getElementById('loading-text').innerText = t.loading;
      document.getElementById('nav-title').innerText = t.navTitle;
      document.getElementById('nav-subtitle').innerText = t.navSubtitle;
      document.getElementById('th-currency').innerText = t.thCurrency;
      document.getElementById('th-type').innerText = t.thType;
      document.getElementById('th-buy').innerText = t.thBuy;
      document.getElementById('th-sell').innerText = t.thSell;
      document.getElementById('th-source').innerText = t.thSource;
      document.getElementById('title-rates').innerText = t.titleRates;
      document.getElementById('title-converter').innerText = t.titleConverter;
      document.getElementById('title-usdt-sources').innerText = t.titleUsdtSources;
      document.getElementById('label-from').innerText = t.labelFrom;
      document.getElementById('label-to').innerText = t.labelTo;
      document.getElementById('title-usd-chart').innerText = t.titleUsdChart;
      document.getElementById('title-gbp-chart').innerText = t.titleGbpChart;
      document.getElementById('title-api-docs').innerText = t.titleApiDocs;
      document.getElementById('api-docs-desc').innerText = t.apiDocsDesc;
      document.getElementById('copy-btn').innerText = t.copyBtn;

      // Re-populate values that need translations
      if (apiData) {
        renderRatesTable();
        renderUsdtSources();
        renderCharts();
        updateLastUpdated();
      }
    }

    async function init() {
      // Set current API endpoint address automatically
      const apiEndpoint = window.location.origin + '/api/rates';
      document.getElementById('api-endpoint-text').innerText = apiEndpoint;

      try {
        const response = await fetch('/api/rates');
        if (!response.ok) throw new Error("HTTP error " + response.status);
        apiData = await response.json();
        
        renderRatesTable();
        renderUsdtSources();
        renderCharts();
        calculateConversion();
        updateLastUpdated();
        
        // Hide loading
        document.getElementById('loading').classList.add('hidden');
      } catch (err) {
        console.error(err);
        document.getElementById('loading-text').innerText = dictionary[currentLang].errorLoading;
      }
    }

    function formatNumber(num) {
      return Number(num).toLocaleString(currentLang === 'fa' ? 'fa-IR' : 'en-US');
    }

    function updateLastUpdated() {
      if (!apiData) return;
      const date = new Date(apiData.timestamp);
      const timeStr = date.toLocaleTimeString(currentLang === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      document.getElementById('last-updated-text').innerText = dictionary[currentLang].lastUpdated + " " + timeStr;
    }

    function renderRatesTable() {
      const tbody = document.getElementById('rates-tbody');
      tbody.innerHTML = '';

      const t = dictionary[currentLang];
      const usd = apiData.rates.USD;
      const gbp = apiData.rates.GBP;
      const usdt = apiData.rates.USDT;
      const offUsd = apiData.official_rates.USD;
      const offGbp = apiData.official_rates.GBP;

      // Row definitions
      const rows = [
        { name: 'USD', flag: '🇺🇸', type: t.freeMarket, isOfficial: false, buy: usd.buy, sell: usd.sell, unit: t.toman, src: 'Bonbast' },
        { name: 'USDT', flag: '🟢', type: t.freeMarket, isOfficial: false, buy: usdt.buy, sell: usdt.sell, unit: t.toman, src: 'Bitpin / Wallex' },
        { name: 'GBP', flag: '🇬🇧', type: t.freeMarket, isOfficial: false, buy: gbp.buy, sell: gbp.sell, unit: t.toman, src: 'Bonbast' },
        { name: 'USD', flag: '🇺🇸', type: t.officialRate, isOfficial: true, buy: null, sell: Math.round(offUsd.rate / 10), unit: t.toman, src: 'CBI (Gov)' },
        { name: 'GBP', flag: '🇬🇧', type: t.officialRate, isOfficial: true, buy: null, sell: Math.round(offGbp.rate / 10), unit: t.toman, src: 'CBI (Gov)' }
      ];

      rows.forEach(r => {
        const tr = document.createElement('tr');
        
        // Buy text/val
        const buyVal = r.buy ? \`\${formatNumber(r.buy)} \${r.unit}\` : '-';
        const buySub = r.buy ? \`\${formatNumber(r.buy * 10)} \${t.rial}\` : '';

        // Sell text/val
        const sellVal = \`\${formatNumber(r.sell)} \${r.unit}\`;
        const sellSub = \`\${formatNumber(r.sell * 10)} \${t.rial}\`;

        tr.innerHTML = \`
          <td>
            <div class="currency-cell">
              <span class="flag-icon">\${r.flag}</span>
              <span>\${r.name}</span>
            </div>
          </td>
          <td>
            <span class="badge \${r.isOfficial ? 'badge-official' : 'badge-market'}">\${r.type}</span>
          </td>
          <td>
            <div class="price-val">\${buyVal}</div>
            <div class="price-sub">\${buySub}</div>
          </td>
          <td>
            <div class="price-val">\${sellVal}</div>
            <div class="price-sub">\${sellSub}</div>
          </td>
          <td style="color: var(--text-secondary); font-size: 0.875rem;">
            \${r.src}
          </td>
        \`;
        tbody.appendChild(tr);
      });
    }

    function renderUsdtSources() {
      const list = document.getElementById('usdt-sources-list');
      list.innerHTML = '';
      
      const sources = apiData.rates.USDT.sources;
      
      for (const [name, info] of Object.entries(sources)) {
        const item = document.createElement('div');
        item.className = 'source-item';
        
        let priceStr = '';
        if (info.sell && info.buy) {
          priceStr = \`\${formatNumber(info.sell)} TMN\`;
        } else if (info.price) {
          priceStr = \`\${formatNumber(info.price)} TMN\`;
        }

        item.innerHTML = \`
          <div class="source-name">
            <span class="source-dot"></span>
            <span>\${name}</span>
          </div>
          <div class="price-val" style="font-size: 0.95rem;">\${priceStr}</div>
        \`;
        list.appendChild(item);
      }
    }

    function calculateConversion() {
      if (!apiData) return;

      const sourceVal = parseFloat(document.getElementById('calc-source-val').value) || 0;
      const sourceCurr = document.getElementById('calc-source-curr').value;
      const targetCurr = document.getElementById('calc-target-curr').value;
      const targetInput = document.getElementById('calc-target-val');

      if (sourceCurr === targetCurr) {
        targetInput.value = formatNumber(sourceVal);
        return;
      }

      // Convert source to Toman
      let valueInToman = 0;
      const usdMarket = apiData.rates.USD.sell;
      const gbpMarket = apiData.rates.GBP.sell;
      const usdtMarket = apiData.rates.USDT.sell;

      if (sourceCurr === 'USD') valueInToman = sourceVal * usdMarket;
      else if (sourceCurr === 'GBP') valueInToman = sourceVal * gbpMarket;
      else if (sourceCurr === 'USDT') valueInToman = sourceVal * usdtMarket;
      else if (sourceCurr === 'TMN') valueInToman = sourceVal;
      else if (sourceCurr === 'IRR') valueInToman = sourceVal / 10;

      // Convert Toman to target
      let targetVal = 0;
      if (targetCurr === 'USD') targetVal = valueInToman / usdMarket;
      else if (targetCurr === 'GBP') targetVal = valueInToman / gbpMarket;
      else if (targetCurr === 'USDT') targetVal = valueInToman / usdtMarket;
      else if (targetCurr === 'TMN') targetVal = valueInToman;
      else if (targetCurr === 'IRR') targetVal = valueInToman * 10;

      // Format decimal digits
      let formattedVal = '';
      if (targetCurr === 'TMN' || targetCurr === 'IRR') {
        formattedVal = formatNumber(Math.round(targetVal));
      } else {
        formattedVal = targetVal.toLocaleString(currentLang === 'fa' ? 'fa-IR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      }

      targetInput.value = formattedVal;
    }

    function renderCharts() {
      const history = apiData.history_7d;
      if (!history || !history.USD || !history.GBP) return;

      renderSingleChart('usd-chart-container', history.USD, 'chart-line', 'chart-area', 'chart-gradient');
      renderSingleChart('gbp-chart-container', history.GBP, 'chart-line chart-line-gbp', 'chart-area chart-area-gbp', 'chart-gradient-gbp');
    }

    function renderSingleChart(containerId, dataPoints, lineClass, areaClass, gradientId) {
      const container = document.getElementById(containerId);
      container.innerHTML = '';

      const width = 500;
      const height = 180;
      const padding = 30;

      // Find bounds
      const prices = dataPoints.map(d => d.sell);
      const minPrice = Math.min(...prices) * 0.995;
      const maxPrice = Math.max(...prices) * 1.005;
      const priceRange = maxPrice - minPrice;

      const numPoints = dataPoints.length;
      
      // Calculate coordinates
      const coords = dataPoints.map((dp, i) => {
        const x = padding + (i / (numPoints - 1)) * (width - 2 * padding);
        const y = height - padding - ((dp.sell - minPrice) / priceRange) * (height - 2 * padding);
        return { x, y, dp };
      });

      // Construct SVG path
      let linePath = '';
      let areaPath = \`M \${coords[0].x} \${height - padding} \`;
      
      coords.forEach((c, i) => {
        const command = i === 0 ? 'M' : 'L';
        linePath += \`\${command} \${c.x} \${c.y} \`;
        areaPath += \`L \${c.x} \${c.y} \`;
      });
      areaPath += \`L \${coords[coords.length - 1].x} \${height - padding} Z\`;

      // Create SVG structure
      let gridLines = '';
      // Horizontal grid lines (3 steps)
      for (let i = 0; i <= 3; i++) {
        const val = minPrice + (i / 3) * priceRange;
        const y = height - padding - (i / 3) * (height - 2 * padding);
        gridLines += \`<line x1="\${padding}" y1="\${y}" x2="\${width - padding}" y2="\${y}" class="chart-grid-line" />\`;
        gridLines += \`<text x="\${padding - 5}" y="\${y + 4}" class="chart-axis-text" text-anchor="end">\${Math.round(val).toLocaleString()}</text>\`;
      }

      // X-Axis dates
      let xAxisLabels = '';
      coords.forEach((c, i) => {
        // Show labels for start, middle, and end
        if (i === 0 || i === Math.floor(numPoints / 2) || i === numPoints - 1) {
          const dateParts = c.dp.date.split('/');
          const label = dateParts.length === 3 ? \`\${dateParts[1]}/\${dateParts[2]}\` : c.dp.date;
          xAxisLabels += \`<text x="\${c.x}" y="\${height - 10}" class="chart-axis-text" text-anchor="middle">\${label}</text>\`;
        }
      });

      // Interactive nodes
      let dots = '';
      coords.forEach((c, i) => {
        dots += \`<circle cx="\${c.x}" cy="\${c.y}" r="4" fill="#fff" stroke="\${lineClass.includes('gbp') ? '#a855f7' : '#6366f1'}" stroke-width="2" style="cursor: pointer;" onmouseover="showTooltip(event, '\${c.dp.date}', \${c.dp.sell})" onmouseout="hideTooltip()"/>\`;
      });

      // Assemble final SVG
      const color1 = lineClass.includes('gbp') ? '#a855f7' : '#6366f1';
      const color2 = lineClass.includes('gbp') ? 'rgba(168, 85, 247, 0)' : 'rgba(99, 102, 241, 0)';

      const svgHtml = \`
        <svg viewBox="0 0 \${width} \${height}" class="chart-svg">
          <defs>
            <linearGradient id="\${gradientId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="\${color1}" />
              <stop offset="100%" stop-color="\${color2}" />
            </linearGradient>
          </defs>
          \${gridLines}
          <path d="\${areaPath}" class="\${areaClass}" />
          <path d="\${linePath}" class="\${lineClass}" />
          \${xAxisLabels}
          \${dots}
        </svg>
        <div class="chart-tooltip" id="tooltip"></div>
      \`;

      container.innerHTML = svgHtml;
    }

    function showTooltip(e, date, price) {
      const tooltip = e.target.closest('.chart-container').querySelector('.chart-tooltip');
      const containerRect = e.target.closest('.chart-container').getBoundingClientRect();
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;

      tooltip.innerHTML = \`<strong>\${date}</strong><br/>\${formatNumber(price)} \${dictionary[currentLang].toman}\`;
      tooltip.style.left = \`\${x + 10}px\`;
      tooltip.style.top = \`\${y - 45}px\`;
      tooltip.style.opacity = 1;
    }

    function hideTooltip() {
      const tooltips = document.querySelectorAll('.chart-tooltip');
      tooltips.forEach(t => t.style.opacity = 0);
    }

    function copyApiUrl() {
      const text = document.getElementById('api-endpoint-text').innerText;
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-btn');
        btn.innerText = dictionary[currentLang].copied;
        btn.style.background = 'var(--accent-green)';
        btn.style.color = '#fff';
        setTimeout(() => {
          btn.innerText = dictionary[currentLang].copyBtn;
          btn.style.background = 'rgba(255, 255, 255, 0.05)';
          btn.style.color = 'var(--text-primary)';
        }, 2000);
      });
    }

    // Start everything
    window.addEventListener('DOMContentLoaded', init);
  </script>
</body>
</html>
`;
