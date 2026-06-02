// lib/finviz.ts — Server-side Finviz Elite fetcher
// Authenticates with FINVIZ_EMAIL + FINVIZ_PASSWORD, caches the session cookie.

export interface FinvizQuote {
  symbol: string;
  rvol: number | null;
  unusualVolume: boolean;
  newHighDay: boolean;
  changePercent: number | null;
  gap: number | null;
  sma20rel: 'above' | 'below' | null;
  sma50rel: 'above' | 'below' | null;
  sma200rel: 'above' | 'below' | null;
  avgVolume: number | null;
  float: number | null;
  sector: string | null;
  industry: string | null;
  groupStrength: 'strong' | 'weak' | 'neutral' | null;
  price: number | null;
  lastUpdated: string;
}

export interface FinvizFuture {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  direction: 'up' | 'down' | 'flat' | null;
  lastUpdated: string;
}

export interface FinvizResult<T> {
  data: T[];
  sourceError?: string;
  lastUpdated: string;
}

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60_000;
// Session cookie cached separately with a longer TTL (8 hours)
let sessionCache: { cookie: string; ts: number } | null = null;
const SESSION_TTL = 8 * 60 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < TTL) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

async function getSessionCookie(): Promise<{ cookie: string | null; error?: string }> {
  // 1. Prefer an already-valid cached session
  if (sessionCache && Date.now() - sessionCache.ts < SESSION_TTL) {
    return { cookie: sessionCache.cookie };
  }
  // 2. Hard-coded override still supported
  const override = process.env.FINVIZ_SESSION_COOKIE;
  if (override) {
    sessionCache = { cookie: override, ts: Date.now() };
    return { cookie: override };
  }
  // 3. Auto-login with email + password
  const email = process.env.FINVIZ_EMAIL;
  const password = process.env.FINVIZ_PASSWORD;
  if (!email || !password) {
    return { cookie: null, error: 'Set FINVIZ_EMAIL and FINVIZ_PASSWORD in .env.local' };
  }
  try {
    const resp = await fetch('https://finviz.com/login_submit.ashx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; Tradevi/3.0)',
        Referer: 'https://finviz.com/login.ashx',
      },
      body: new URLSearchParams({ email, password, remember: 'on' }).toString(),
      redirect: 'manual',
    });
    // Finviz sets _finviz_toekn (their typo) in a Set-Cookie header on successful login
    const raw = resp.headers.get('set-cookie') ?? '';
    const match = raw.match(/_finviz_toekn=([^;]+)/);
    if (!match) {
      return { cookie: null, error: 'Finviz login failed — check FINVIZ_EMAIL and FINVIZ_PASSWORD' };
    }
    const cookie = match[1];
    sessionCache = { cookie, ts: Date.now() };
    return { cookie };
  } catch (err) {
    return { cookie: null, error: `Finviz login error: ${String(err)}` };
  }
}

function makeHeaders(cookie: string): Record<string, string> {
  // Send both known Finviz cookie names — Elite uses _finviz_t, older accounts used _finviz_toekn
  const cookieStr = cookie.includes('=')
    ? cookie // already a full cookie string
    : `_finviz_t=${cookie}; _finviz_toekn=${cookie}`;
  return {
    Cookie: cookieStr,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://elite.finviz.com/screener.ashx',
  };
}

function parseFinvizNumber(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw === 'N/A' || raw.trim() === '') return null;
  const s = raw.trim();
  const multiplier = s.endsWith('B') ? 1e9 : s.endsWith('M') ? 1e6 : s.endsWith('K') ? 1e3 : 1;
  const num = parseFloat(s.replace(/[BMK%,]/g, ''));
  if (isNaN(num)) return null;
  return num * multiplier;
}

function parsePercent(raw: string | undefined): number | null {
  if (!raw || raw === '-' || raw === 'N/A') return null;
  const num = parseFloat(raw.replace('%', ''));
  return isNaN(num) ? null : num;
}

function extractTableCells(html: string): string[][] {
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const trContent = trMatch[1];
    const cells: string[] = [];
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      const text = tdMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, '')
        .trim();
      cells.push(text);
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

export async function fetchFinvizScreener(
  tickers: string[]
): Promise<FinvizResult<FinvizQuote>> {
  if (tickers.length === 0) {
    return { data: [], lastUpdated: new Date().toISOString() };
  }

  const { cookie, error: sessionError } = await getSessionCookie();
  if (!cookie) {
    return {
      data: [],
      sourceError: sessionError ?? 'Finviz credentials not configured',
      lastUpdated: new Date().toISOString(),
    };
  }

  const cacheKey = `screener:${[...tickers].sort().join(',')}`;
  const cached = getCached<FinvizResult<FinvizQuote>>(cacheKey);
  if (cached) return cached;

  const tickerParam = tickers.join(',');
  const url = `https://elite.finviz.com/screener.ashx?v=152&t=${encodeURIComponent(tickerParam)}&o=-change`;

  let html: string;
  try {
    const resp = await fetch(url, {
      headers: makeHeaders(cookie),
      cache: 'no-store',
    });
    if (resp.status === 429) {
      return {
        data: [],
        sourceError: 'Finviz rate limit — retry in 60s',
        lastUpdated: new Date().toISOString(),
      };
    }
    if (!resp.ok) {
      return {
        data: [],
        sourceError: `Finviz returned HTTP ${resp.status}`,
        lastUpdated: new Date().toISOString(),
      };
    }
    html = await resp.text();
  } catch (err) {
    return {
      data: [],
      sourceError: `Finviz fetch failed: ${String(err)}`,
      lastUpdated: new Date().toISOString(),
    };
  }

  const now = new Date().toISOString();
  const rows = extractTableCells(html);

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map((c) => c.toLowerCase());
    if (lower.includes('ticker') || lower.includes('no.')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return {
      data: [],
      sourceError: 'Could not parse Finviz table — check FINVIZ_SESSION_COOKIE',
      lastUpdated: now,
    };
  }

  const headers = rows[headerIdx].map((h) => h.toLowerCase().trim());
  const col = (name: string): number => {
    const exact = headers.indexOf(name);
    if (exact >= 0) return exact;
    return headers.findIndex((h) => h.includes(name));
  };

  const iTicker = col('ticker') >= 0 ? col('ticker') : 1;
  const iPrice = col('price');
  const iChange = col('change');
  const iVolume = col('volume');
  const iAvgVol = col('avg volume') >= 0 ? col('avg volume') : col('avg vol');
  const iRvol = col('rel volume') >= 0 ? col('rel volume') : col('rel vol');
  const iFloat = col('float');
  const iSma20 = col('sma20');
  const iSma50 = col('sma50');
  const iSma200 = col('sma200');
  const iGap = col('gap');
  const iSector = col('sector');
  const iIndustry = col('industry');
  const iPerfWeek = col('perf week') >= 0 ? col('perf week') : col('perf');

  const upperTickers = tickers.map((t) => t.toUpperCase());
  const data: FinvizQuote[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 5) continue;

    const symbol = (iTicker >= 0 ? row[iTicker] : '').toUpperCase().trim();
    if (!symbol || !upperTickers.includes(symbol)) continue;

    const price = iPrice >= 0 ? parseFinvizNumber(row[iPrice]) : null;
    const changePercent = iChange >= 0 ? parsePercent(row[iChange]) : null;
    const volume = iVolume >= 0 ? parseFinvizNumber(row[iVolume]) : null;
    const avgVolume = iAvgVol >= 0 ? parseFinvizNumber(row[iAvgVol]) : null;
    const rvolRaw = iRvol >= 0 ? parseFinvizNumber(row[iRvol]) : null;
    const rvol = rvolRaw ?? (volume && avgVolume && avgVolume > 0 ? volume / avgVolume : null);

    const floatVal = iFloat >= 0 ? parseFinvizNumber(row[iFloat]) : null;
    const gap = iGap >= 0 ? parsePercent(row[iGap]) : null;

    const sma20pct = iSma20 >= 0 ? parsePercent(row[iSma20]) : null;
    const sma50pct = iSma50 >= 0 ? parsePercent(row[iSma50]) : null;
    const sma200pct = iSma200 >= 0 ? parsePercent(row[iSma200]) : null;

    const sma20rel = sma20pct === null ? null : sma20pct >= 0 ? ('above' as const) : ('below' as const);
    const sma50rel = sma50pct === null ? null : sma50pct >= 0 ? ('above' as const) : ('below' as const);
    const sma200rel = sma200pct === null ? null : sma200pct >= 0 ? ('above' as const) : ('below' as const);

    const sector = iSector >= 0 ? row[iSector] || null : null;
    const industry = iIndustry >= 0 ? row[iIndustry] || null : null;

    let groupStrength: FinvizQuote['groupStrength'] = null;
    if (iPerfWeek >= 0) {
      const perf = parsePercent(row[iPerfWeek]);
      if (perf !== null) {
        groupStrength = perf >= 1 ? 'strong' : perf <= -1 ? 'weak' : 'neutral';
      }
    }

    const unusualVolume = rvol !== null && rvol >= 2;

    // Finviz 52W High column check for new high of day
    const iHighCol = headers.findIndex((h) => h === '52w high' || h === '52w h');
    let newHighDay = false;
    if (iHighCol >= 0) {
      const val = row[iHighCol]?.trim() ?? '';
      // "0.00%" means price is at 52-week high — reasonable proxy for new high of day on screener
      newHighDay = val === '0.00%' || val === '0%';
    }

    data.push({
      symbol,
      rvol,
      unusualVolume,
      newHighDay,
      changePercent,
      gap,
      sma20rel,
      sma50rel,
      sma200rel,
      avgVolume,
      float: floatVal,
      sector,
      industry,
      groupStrength,
      price,
      lastUpdated: now,
    });
  }

  const result: FinvizResult<FinvizQuote> = { data, lastUpdated: now };
  setCache(cacheKey, result);
  return result;
}

const FUTURES_SYMBOLS = ['ES', 'NQ', 'YM', 'RTY', 'NKD'];
const FUTURES_NAMES: Record<string, string> = {
  ES: 'S&P 500 Futures',
  NQ: 'Nasdaq 100 Futures',
  YM: 'Dow Jones Futures',
  RTY: 'Russell 2000 Futures',
  NKD: 'Nikkei 225 Futures',
};

export async function fetchFinvizFutures(): Promise<FinvizResult<FinvizFuture>> {
  const cacheKey = 'futures';
  const cached = getCached<FinvizResult<FinvizFuture>>(cacheKey);
  if (cached) return cached;

  const { cookie } = await getSessionCookie();
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (cookie) {
    headers['Cookie'] = cookie.includes('=') ? cookie : `_finviz_t=${cookie}; _finviz_toekn=${cookie}`;
  }

  let html: string;
  try {
    const resp = await fetch('https://finviz.com/futures.ashx', {
      headers,
      cache: 'no-store',
    });
    if (!resp.ok) {
      return {
        data: [],
        sourceError: `Finviz futures HTTP ${resp.status}`,
        lastUpdated: new Date().toISOString(),
      };
    }
    html = await resp.text();
  } catch (err) {
    return {
      data: [],
      sourceError: `Finviz futures fetch failed: ${String(err)}`,
      lastUpdated: new Date().toISOString(),
    };
  }

  const now = new Date().toISOString();
  const rows = extractTableCells(html);
  const data: FinvizFuture[] = [];

  for (const row of rows) {
    for (const sym of FUTURES_SYMBOLS) {
      if (data.find((d) => d.symbol === sym)) continue;
      const symCell = row.find(
        (c) =>
          c.toUpperCase() === sym ||
          c.toUpperCase().startsWith(sym + ' ') ||
          c.toUpperCase() === sym + '=F'
      );
      if (!symCell) continue;

      let price: number | null = null;
      let changePercent: number | null = null;

      for (const cell of row) {
        const t = cell.trim().replace(/,/g, '');
        if (price === null) {
          const n = parseFloat(t);
          if (!isNaN(n) && n > 50) {
            price = n;
            continue;
          }
        }
        if (changePercent === null && t.endsWith('%')) {
          const n = parseFloat(t.replace('%', ''));
          if (!isNaN(n)) changePercent = n;
        }
      }

      data.push({
        symbol: sym,
        name: FUTURES_NAMES[sym],
        price,
        changePercent,
        direction:
          changePercent === null
            ? null
            : changePercent > 0.05
            ? 'up'
            : changePercent < -0.05
            ? 'down'
            : 'flat',
        lastUpdated: now,
      });
      break;
    }
  }

  const result: FinvizResult<FinvizFuture> = { data, lastUpdated: now };
  setCache(cacheKey, result);
  return result;
}
