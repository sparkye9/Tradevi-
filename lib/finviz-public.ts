// lib/finviz-public.ts — Finviz public screener (replicates finvizfinance Python library approach)
// Scrapes finviz.com/screener.ashx (public endpoint, not elite) with Elite session cookie if available.
// Falls back to Yahoo Finance if Finviz blocks the request.

import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60_000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < TTL) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

function parseNum(s: string | undefined): number | null {
  if (!s || s === '-' || s === 'N/A' || s.trim() === '') return null;
  const t = s.trim();
  const mul = t.endsWith('B') ? 1e9 : t.endsWith('M') ? 1e6 : t.endsWith('K') ? 1e3 : 1;
  const n = parseFloat(t.replace(/[BMK%,]/g, ''));
  return isNaN(n) ? null : n * mul;
}

function parsePct(s: string | undefined): number | null {
  if (!s || s === '-' || s === 'N/A') return null;
  const n = parseFloat(s.replace('%', ''));
  return isNaN(n) ? null : n;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').trim();
}

function parseTable(html: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html)) !== null) {
    const cells: string[] = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let td: RegExpExecArray | null;
    while ((td = tdRe.exec(tr[1])) !== null) cells.push(stripTags(td[1]));
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function makeFinvizHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
  const cookie = process.env.FINVIZ_SESSION_COOKIE;
  if (cookie) {
    h['Cookie'] = `_finviz_t=${cookie}; _finviz_toekn=${cookie}`;
  }
  return h;
}

export async function fetchFinvizPublicScreener(
  tickers: string[]
): Promise<FinvizResult<FinvizQuote> & { blocked?: boolean }> {
  if (tickers.length === 0) {
    return { data: [], source: 'Finviz', lastUpdated: new Date().toISOString() };
  }

  const cacheKey = `finviz-public:${[...tickers].sort().join(',')}`;
  const cached = getCached<FinvizResult<FinvizQuote>>(cacheKey);
  if (cached) return cached;

  const now = new Date().toISOString();

  // Use v=111 (overview) — same view the Python finvizfinance library uses
  // Columns: No, Ticker, Company, Sector, Industry, Country, MarketCap, P/E, Price, Change, Volume
  // v=152 gives more fields including SMA20/50/200, RVOL, Gap
  const url = `https://finviz.com/screener.ashx?v=152&t=${encodeURIComponent(tickers.join(','))}&o=-change`;

  let html: string;
  try {
    const resp = await fetch(url, {
      headers: makeFinvizHeaders(),
      cache: 'no-store',
    });

    if (resp.status === 403 || resp.status === 401 || resp.status === 429) {
      return {
        data: [],
        blocked: true,
        sourceError: `Finviz blocked (HTTP ${resp.status}) — falling back to Yahoo Finance`,
        lastUpdated: now,
      };
    }
    if (!resp.ok) {
      return {
        data: [],
        blocked: true,
        sourceError: `Finviz HTTP ${resp.status} — falling back to Yahoo Finance`,
        lastUpdated: now,
      };
    }
    html = await resp.text();
  } catch (err) {
    return {
      data: [],
      blocked: true,
      sourceError: `Finviz unreachable — falling back to Yahoo Finance`,
      lastUpdated: now,
    };
  }

  // Check for login redirect or block page
  if (html.includes('login.ashx') && html.length < 5000) {
    return {
      data: [],
      blocked: true,
      sourceError: 'Finviz requires login — falling back to Yahoo Finance',
      lastUpdated: now,
    };
  }

  const rows = parseTable(html);
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
      blocked: true,
      sourceError: 'Could not parse Finviz table — falling back to Yahoo Finance',
      lastUpdated: now,
    };
  }

  const headers = rows[headerIdx].map((h) => h.toLowerCase().trim());
  const col = (name: string) => {
    const i = headers.indexOf(name);
    return i >= 0 ? i : headers.findIndex((h) => h.includes(name));
  };

  const iT = col('ticker') >= 0 ? col('ticker') : 1;
  const iPrice = col('price');
  const iChange = col('change');
  const iVol = col('volume');
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
  const i52wHigh = headers.findIndex((h) => h === '52w high' || h === '52w h');

  const upperTickers = tickers.map((t) => t.toUpperCase());
  const data: FinvizQuote[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 5) continue;
    const symbol = (iT >= 0 ? row[iT] : '').toUpperCase().trim();
    if (!symbol || !upperTickers.includes(symbol)) continue;

    const price = iPrice >= 0 ? parseNum(row[iPrice]) : null;
    const changePercent = iChange >= 0 ? parsePct(row[iChange]) : null;
    const volume = iVol >= 0 ? parseNum(row[iVol]) : null;
    const avgVolume = iAvgVol >= 0 ? parseNum(row[iAvgVol]) : null;
    const rvolRaw = iRvol >= 0 ? parseNum(row[iRvol]) : null;
    const rvol = rvolRaw ?? (volume && avgVolume && avgVolume > 0 ? volume / avgVolume : null);
    const floatVal = iFloat >= 0 ? parseNum(row[iFloat]) : null;
    const gap = iGap >= 0 ? parsePct(row[iGap]) : null;
    const sma20pct = iSma20 >= 0 ? parsePct(row[iSma20]) : null;
    const sma50pct = iSma50 >= 0 ? parsePct(row[iSma50]) : null;
    const sma200pct = iSma200 >= 0 ? parsePct(row[iSma200]) : null;
    const sma20rel = sma20pct === null ? null : sma20pct >= 0 ? ('above' as const) : ('below' as const);
    const sma50rel = sma50pct === null ? null : sma50pct >= 0 ? ('above' as const) : ('below' as const);
    const sma200rel = sma200pct === null ? null : sma200pct >= 0 ? ('above' as const) : ('below' as const);
    const sector = iSector >= 0 ? row[iSector] || null : null;
    const industry = iIndustry >= 0 ? row[iIndustry] || null : null;
    let groupStrength: FinvizQuote['groupStrength'] = null;
    if (iPerfWeek >= 0) {
      const perf = parsePct(row[iPerfWeek]);
      if (perf !== null) groupStrength = perf >= 1 ? 'strong' : perf <= -1 ? 'weak' : 'neutral';
    }
    let newHighDay = false;
    if (i52wHigh >= 0) {
      const val = row[i52wHigh]?.trim() ?? '';
      newHighDay = val === '0.00%' || val === '0%';
    }

    data.push({
      symbol, price, changePercent, rvol,
      unusualVolume: rvol !== null && rvol >= 2,
      newHighDay, gap, sma20rel, sma50rel, sma200rel,
      avgVolume, float: floatVal, sector, industry, groupStrength,
      lastUpdated: now,
    });
  }

  if (data.length === 0) {
    return {
      data: [],
      blocked: true,
      sourceError: 'Finviz returned no matching rows — falling back to Yahoo Finance',
      lastUpdated: now,
    };
  }

  const result: FinvizResult<FinvizQuote> = { data, source: 'Finviz', lastUpdated: now };
  setCache(cacheKey, result);
  return result;
}
