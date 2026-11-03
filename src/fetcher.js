const config = require('../config');
const fs = require('fs');
const path = require('path');

// Load fallback seed data in case Stooq blocks or is unreachable
let seedData = null;
function getSeedData() {
  if (!seedData) {
    const seedPath = path.resolve(__dirname, 'seed_data.json');
    if (fs.existsSync(seedPath)) {
      try {
        seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      } catch (e) {
        console.error('[Fetcher] Error loading seed_data.json:', e.message);
      }
    }
  }
  return seedData;
}

// In-memory cache for economic news
let newsCache = {
  data: [],
  expiresAt: 0,
};

/**
 * Perform a resilient fetch with browser-like headers, timeout, and 1 retry.
 */
async function fetchWithRetry(url, options = {}, retries = config.fetcher.retryCount) {
  const timeoutMs = config.fetcher.timeoutMs;
  const headers = {
    'User-Agent': config.fetcher.userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    ...options.headers,
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (err) {
      clearTimeout(timer);
      const isLast = attempt >= retries;
      if (isLast) {
        throw err;
      }
      console.warn(`[Fetcher] Request to ${url} failed (attempt ${attempt + 1}/${retries + 1}): ${err.message}. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, config.fetcher.retryDelayMs));
    }
  }
}

/**
 * Fetch currency rate history from NBP API
 */
async function fetchNbpSeries(currencyCode) {
  const url = config.fetcher.nbpUrls[currencyCode.toLowerCase()];
  if (!url) {
    throw new Error(`Unknown NBP currency: ${currencyCode}`);
  }

  try {
    const response = await fetchWithRetry(url);
    const data = await response.json();
    if (!data || !Array.isArray(data.rates)) {
      throw new Error(`Malformed NBP response for ${currencyCode}`);
    }
    return data.rates.map(r => ({
      date: r.effectiveDate,
      close: parseFloat(r.mid),
    })).filter(r => r.date && !isNaN(r.close));
  } catch (err) {
    console.error(`[Fetcher] NBP fetch error for ${currencyCode}: ${err.message}`);
    throw err;
  }
}

/**
 * Parse Stooq CSV content into array of { date, close }
 */
function parseStooqCsv(csvText, symbol) {
  const trimmed = csvText.trim();
  const requiredHeader = 'Data,Otwarcie,Najwyzszy,Najnizszy,Zamkniecie';
  if (!trimmed.startsWith(requiredHeader)) {
    throw new Error(`Invalid Stooq CSV header for ${symbol}. Response started with: ${trimmed.slice(0, 60)}...`);
  }

  const lines = trimmed.split(/\r?\n/);
  const results = [];
  // Line 0 is header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 5) continue;
    const date = parts[0];
    const close = parseFloat(parts[4]);
    if (date && !isNaN(close)) {
      results.push({ date, close });
    }
  }
  return results;
}

/**
 * Fetch financial time series from Stooq with validation and fallback
 */
async function fetchStooqSeries(symbol, limit = 300) {
  const url = `${config.fetcher.stooqBaseUrl}${encodeURIComponent(symbol)}&i=d`;
  try {
    const response = await fetchWithRetry(url);
    const text = await response.text();
    const parsed = parseStooqCsv(text, symbol);
    if (parsed.length === 0) {
      throw new Error(`Empty CSV series parsed for ${symbol}`);
    }
    return parsed.slice(-limit);
  } catch (err) {
    console.warn(`[Fetcher] Stooq fetch failed for symbol '${symbol}': ${err.message}. Falling back to cached seed data.`);
    const seed = getSeedData();
    if (seed && seed[symbol]) {
      return seed[symbol].slice(-limit);
    }
    return [];
  }
}

/**
 * Decode XML entities and strip HTML tags
 */
function sanitizeText(str) {
  if (!str) return '';
  return str
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&oacute;/g, 'ó')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&plusmn;/g, '±')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch latest top economic news from Polish RSS feeds
 */
async function fetchEconomicNews() {
  const now = Date.now();
  if (newsCache.data && newsCache.data.length > 0 && now < newsCache.expiresAt) {
    return newsCache.data;
  }

  const newsList = [];

  // 1. Fetch from Bankier.pl
  try {
    const response = await fetchWithRetry(config.fetcher.news.bankierRss, {}, 1);
    const xml = await response.text();
    const rawItems = xml.split('<item>').slice(1, 12);

    for (const raw of rawItems) {
      const titleRaw = raw.split('<title>')[1]?.split('</title>')[0];
      const linkRaw = raw.split('<link>')[1]?.split('</link>')[0];
      const descRaw = raw.split('<description>')[1]?.split('</description>')[0];
      const pubDateRaw = raw.split('<pubDate>')[1]?.split('</pubDate>')[0];

      const title = sanitizeText(titleRaw);
      let link = sanitizeText(linkRaw);
      if (link.includes('?')) {
        link = link.split('?')[0]; // Clean tracking params
      }
      const description = sanitizeText(descRaw);

      if (title && link) {
        newsList.push({
          title,
          link,
          description: description.length > 180 ? `${description.slice(0, 177)}...` : description,
          pubDate: pubDateRaw ? new Date(pubDateRaw).toISOString() : new Date().toISOString(),
          source: 'Bankier.pl',
          badgeColor: 'sky',
        });
      }
    }
  } catch (err) {
    console.warn('[Fetcher] Error fetching Bankier.pl RSS news:', err.message);
  }

  // Fallback items if RSS failed
  if (newsList.length === 0) {
    newsList.push(
      {
        title: 'NBP: Dane o inflacji i decyzje RPP w centrum uwagi rynków',
        link: 'https://www.bankier.pl/gospodarka/wskazniki-makroekonomiczne/inflacja-rpp',
        description: 'Inwestorzy na rynku długu analizują ścieżkę stóp procentowych NBP oraz zachowanie kursu złotego w obliczu polityki głównych banków centralnych.',
        pubDate: new Date().toISOString(),
        source: 'NBP / Rynek',
        badgeColor: 'emerald',
      },
      {
        title: 'GPW: Zagraniczne fundusze obserwują spółki dywidendowe z WIG i mWIG40',
        link: 'https://www.bankier.pl/gielda/wiadomosci',
        description: 'Solidne fundamenty spółek przemysłowych i banków na warszawskim parkiecie przyciągają kapitał szukający atrakcyjnych stóp dywidendy.',
        pubDate: new Date().toISOString(),
        source: 'GPW / Parkiet',
        badgeColor: 'sky',
      }
    );
  }

  newsCache = {
    data: newsList,
    expiresAt: now + config.fetcher.news.cacheTtlMs,
  };

  return newsList;
}

/**
 * Fetch all required market indicators
 */
async function fetchAllIndicators() {
  console.log('[Fetcher] Fetching macroeconomic & market data...');

  const [usdRes, eurRes, pl10yRes, pl2yRes, de10yRes, wigRes, wig20Res, mwig40Res, swig80Res, wigBankiRes] = await Promise.allSettled([
    fetchNbpSeries('usd'),
    fetchNbpSeries('eur'),
    fetchStooqSeries(config.fetcher.stooqSymbols.pl10y, 120),
    fetchStooqSeries(config.fetcher.stooqSymbols.pl2y, 120),
    fetchStooqSeries(config.fetcher.stooqSymbols.de10y, 120),
    fetchStooqSeries(config.fetcher.stooqSymbols.wig, config.wigHistoryDays),
    fetchStooqSeries(config.fetcher.stooqSymbols.wig20, 120),
    fetchStooqSeries(config.fetcher.stooqSymbols.mwig40, 120),
    fetchStooqSeries(config.fetcher.stooqSymbols.swig80, 120),
    fetchStooqSeries(config.fetcher.stooqSymbols.wig_banki, 120),
  ]);

  const extract = (res, name) => {
    if (res.status === 'fulfilled' && res.value && res.value.length > 0) {
      return res.value;
    }
    const seed = getSeedData();
    if (seed && seed[name]) {
      return seed[name];
    }
    return [];
  };

  return {
    usd: extract(usdRes, 'usd'),
    eur: extract(eurRes, 'eur'),
    pl10y: extract(pl10yRes, config.fetcher.stooqSymbols.pl10y),
    pl2y: extract(pl2yRes, config.fetcher.stooqSymbols.pl2y),
    de10y: extract(de10yRes, config.fetcher.stooqSymbols.de10y),
    wig: extract(wigRes, config.fetcher.stooqSymbols.wig),
    wig20: extract(wig20Res, config.fetcher.stooqSymbols.wig20),
    mwig40: extract(mwig40Res, config.fetcher.stooqSymbols.mwig40),
    swig80: extract(swig80Res, config.fetcher.stooqSymbols.swig80),
    wig_banki: extract(wigBankiRes, config.fetcher.stooqSymbols.wig_banki),
  };
}

module.exports = {
  fetchWithRetry,
  fetchNbpSeries,
  fetchStooqSeries,
  parseStooqCsv,
  fetchEconomicNews,
  fetchAllIndicators,
};
