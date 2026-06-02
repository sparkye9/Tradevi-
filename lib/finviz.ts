// lib/finviz.ts
// Server-side Finviz Elite data fetcher.
// Uses the _finviz_toekn session cookie (note Finviz's intentional typo).
// Never substitutes fake data. Returns sourceError on failure.

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
  lastUpdated: string; // ISO
}

export interface FinvizFuture {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  direction: 'up' | 'down' | 'flat' | null;
  lastUpdated: string; // ISO
}

export interface FinvizResult<T> {
  data: T[];
  sourceError?: string;
  lastUpdated: string;
}

// 60-second in-memory cache
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60_000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) {
    return entry.data as T;
  }
  return null;
}

function setCached(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

function getCookie(): string | null {
  return process.env.FINVIZ_SESSION_COOKIE ?? null;
}

// Parse a number string like "1.23M", "456K", "1.2B" or plain "123.45"
function parseFinvizNumber(raw: string | undefined | null): number | null {
  if (!raw || raw === '-' || raw === '') return null;
  const s = raw.trim().replace(/,/g, '');
  const multipliers: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  const last = s[s.length - 1].toUpperCase();
  if (multipliers[last]) {
    const n = parseFloat(s.slice(0, -1));
    return isNaN(n) ? null : n * multipliers[last];
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Extract text from a simple HTML tag
function extractCells(html: string): string[] {
  const cells: string[] = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    // Strip inner tags
    cells.push(m[1].replace(/<[^>]+>/g, '').trim());
  }
  return cells;
}

// Finviz screener column indices for v=111 (overview)
// We request specific columns via c= param. We'll parse what comes back.
// Column map for the Finviz screener table (varies by view)
// We'll use view 152 (custom) or rely on parsing header row.

async function finvizFetch(url: string, cookie: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      Cookie: `_finviz_toekn=${cookie}`,
      'User-Agent':
        'Mozilla/5.0 (compatible; Tradevi/3.0; +https://tradevi.app)',
      Accept: 'text/html,application/xhtml+xml',
    },
    next: { revalidate: 0 },
  });
  if (!resp.ok) {
    throw new Error(`Finviz HTTP ${resp.status}`);
  }
  return resp.text();
}

// Parse screener HTML and map columns by header
function parseScreenerHtml(html: string, tickers: string[]): FinvizQuote[] {
  const now = new Date().toISOString();

  // Find the screener results table
  const tableMatch = html.match(
    /<table[^>]+class="[^"]*screener-table[^"]*"[^>]*>([\s\S]*?)<\/table>/i
  );
  if (!tableMatch) {
    // Try alternate pattern
    const altMatch = html.match(/<table[^>]+id="screener-views-table"[^>]*>([\s\S]*?)<\/table>/i);
    if (!altMatch) return [];
  }

  const tableHtml = tableMatch ? tableMatch[1] : '';

  // Extract header row
  const headerMatch = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
  const headers: string[] = [];
  if (headerMatch) {
    const hre = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let hm: RegExpExecArray | null;
    while ((hm = hre.exec(headerMatch[1])) !== null) {
      headers.push(hm[1].replace(/<[^>]+>/g, '').trim());
    }
  }

  // Extract data rows
  const rows: string[][] = [];
  const rowRe = /<tr[^>]*class="[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(tableHtml)) !== null) {
    rows.push(extractCells(rm[1]));
  }

  if (rows.length === 0) return [];

  // Build index map
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    idx[h.toLowerCase()] = i;
  });

  const get = (row: string[], key: string): string | undefined => {
    const i = idx[key.toLowerCase()];
    return i !== undefined ? row[i] : undefined;
  };

  return rows
    .map((row): FinvizQuote | null => {
      const symbol = get(row, 'ticker') ?? get(row, 'symbol') ?? '';
      if (!symbol) return null;

      const price = parseFinvizNumber(get(row, 'price'));
      const changeStr = get(row, 'change') ?? get(row, '% change') ?? '';
      const changePercent = parseFinvizNumber(changeStr.replace('%', ''));
      const gapStr = get(row, 'gap') ?? '';
      const gap = parseFinvizNumber(gapStr.replace('%', ''));
      const rvolStr = get(row, 'rel volume') ?? get(row, 'rvol') ?? '';
      const rvol = parseFinvizNumber(rvolStr);
      const avgVolStr = get(row, 'avg volume') ?? get(row, 'average volume') ?? '';
      const avgVolume = parseFinvizNumber(avgVolStr);
      const floatStr = get(row, 'float') ?? '';
      const floatVal = parseFinvizNumber(floatStr);

      const sma20Str = (get(row, 'sma20') ?? '').toLowerCase();
      const sma50Str = (get(row, 'sma50') ?? '').toLowerCase();
      const sma200Str = (get(row, 'sma200') ?? '').toLowerCase();

      const smaRel = (s: string): 'above' | 'below' | null => {
        if (s.includes('above') || s.startsWith('+')) return 'above';
        if (s.includes('below') || s.startsWith('-')) return 'below';
        return null;
      };

      const volumeStr = (get(row, 'volume') ?? '').toLowerCase();
      const unusualVolume =
        rvol !== null && rvol > 2.0;

      const newHighDay =
        (get(row, '52w high') ?? '').toLowerCase().includes('new') ||
        (get(row, 'high') ?? '').toLowerCase().includes('new');

      const sector = get(row, 'sector') ?? null;
      const industry = get(row, 'industry') ?? get(row, 'group') ?? null;

      // Group strength from sector performance columns if present
      const perfStr = (get(row, 'perf ytd') ?? get(row, 'perf week') ?? '').replace('%', '');
      const perfVal = parseFinvizNumber(perfStr);
      let groupStrength: 'strong' | 'weak' | 'neutral' | null = null;
      if (perfVal !== null) {
        if (perfVal > 2) groupStrength = 'strong';
        else if (perfVal < -2) groupStrength = 'weak';
        else groupStrength = 'neutral';
      }

      return {
        symbol,
        rvol,
        unusualVolume,
        newHighDay,
        changePercent,
        gap,
        sma20rel: smaRel(sma20Str),
        sma50rel: smaRel(sma50Str),
        sma200rel: smaRel(sma200Str),
        avgVolume,
        float: floatVal,
        sector,
        industry,
        groupStrength,
        price,
        lastUpdated: now,
      };
    })
    .filter((q): q is FinvizQuote => q !== null);
}

export async function fetchFinvizScreener(
  tickers: string[]
): Promise<FinvizResult<FinvizQuote>> {
  const now = new Date().toISOString();
  const cookie = getCookie();
  if (!cookie) {
    return {
      data: [],
      sourceError: 'FINVIZ_SESSION_COOKIE not set',
      lastUpdated: now,
    };
  }

  const cacheKey = `screener:${tickers.sort().join(',')}`;
  const cached = getCached<FinvizResult<FinvizQuote>>(cacheKey);
  if (cached) return cached;

  try {
    const tickerList = tickers.join(',');
    // View 152 = custom, include key columns
    // c= param: 1=ticker,2=company,3=sector,4=industry,5=country,6=mktcap,7=pe,8=fwdpe,
    // 9=peg,10=ps,11=pb,12=pcs,13=pcf,14=epsttm,15=epsnext,16=epspast5y,17=epsnext5y,
    // 18=epsnextq,19=salespast5y,20=eps next y,21=eps this y,22=eps q/q,23=sales q/q,
    // 24=outstanding,25=float,26=insiderOwn,27=transInst,28=short float,29=short ratio,
    // 30=return on assets,31=return on equity,32=return on invest,33=curr ratio,34=quick ratio,
    // 35=lt debt/eq,36=tot debt/eq,37=gross margin,38=oper margin,39=profit margin,
    // 40=payout,41=52w high,42=52w low,43=rsi,44=from open,45=gap,46=avg volume,
    // 47=relative volume,48=price,49=change,50=volume,51=earnings,52=target price,53=atr
    const url =
      `https://elite.finviz.com/screener.ashx?v=111&t=${tickerList}&o=-change` +
      `&c=1,3,4,25,45,46,47,48,49,50,65,66,67`;

    const html = await finvizFetch(url, cookie);
    const quotes = parseScreenerHtml(html, tickers);

    // If parsing returned empty (possibly different HTML structure), still return gracefully
    const result: FinvizResult<FinvizQuote> = {
      data: quotes,
      lastUpdated: now,
    };

    if (quotes.length === 0 && tickers.length > 0) {
      // Try alternate URL format
      const url2 = `https://elite.finviz.com/screener.ashx?v=152&t=${tickerList}`;
      const html2 = await finvizFetch(url2, cookie);
      const quotes2 = parseScreenerHtml(html2, tickers);
      if (quotes2.length > 0) {
        result.data = quotes2;
      }
    }

    setCached(cacheKey, result);
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      data: [],
      sourceError: `Finviz fetch failed: ${msg}`,
      lastUpdated: now,
    };
  }
}

export async function fetchFinvizFutures(): Promise<FinvizResult<FinvizFuture>> {
  const now = new Date().toISOString();
  const cookie = getCookie();
  if (!cookie) {
    return {
      data: [],
      sourceError: 'FINVIZ_SESSION_COOKIE not set',
      lastUpdated: now,
    };
  }

  const cacheKey = 'futures';
  const cached = getCached<FinvizResult<FinvizFuture>>(cacheKey);
  if (cached) return cached;

  try {
    const html = await finvizFetch('https://finviz.com/futures.ashx', cookie);

    // Target symbols
    const targets: Record<string, string> = {
      ES: 'E-mini S&P 500',
      NQ: 'E-mini Nasdaq 100',
      YM: 'E-mini Dow',
      RTY: 'E-mini Russell 2000',
      NKD: 'Nikkei 225',
    };

    const futures: FinvizFuture[] = [];

    for (const [sym, name] of Object.entries(targets)) {
      // Look for the symbol in the futures table
      // Pattern: the row containing the symbol label
      const pattern = new RegExp(
        `>${sym}[^<]*</[^>]+>[\\s\\S]{0,500}?class="[^"]*futures[^"]*"`,
        'i'
      );

      // Simpler approach: find all table rows and look for the symbol
      const rowRe = new RegExp(
        `<tr[^>]*>[\\s\\S]*?${sym}[\\s\\S]*?</tr>`,
        'gi'
      );
      let rowMatch: RegExpExecArray | null;
      let found = false;

      while ((rowMatch = rowRe.exec(html)) !== null) {
        const row = rowMatch[0];
        const cells = extractCells(row);
        if (cells.length < 2) continue;

        // Find price and change in cells
        let price: number | null = null;
        let changePercent: number | null = null;

        for (const cell of cells) {
          if (price === null) {
            const p = parseFinvizNumber(cell.replace(/[%+]/g, ''));
            if (p !== null && p > 100) price = p;
          }
          if (cell.includes('%')) {
            const c = parseFinvizNumber(cell.replace('%', ''));
            if (c !== null) changePercent = c;
          }
        }

        let direction: 'up' | 'down' | 'flat' | null = null;
        if (changePercent !== null) {
          if (changePercent > 0.05) direction = 'up';
          else if (changePercent < -0.05) direction = 'down';
          else direction = 'flat';
        }

        futures.push({ symbol: sym, name, price, changePercent, direction, lastUpdated: now });
        found = true;
        break;
      }

      // If pattern matching didn't work, try a simpler approach
      if (!found) {
        // Look for the symbol text directly
        const symIdx = html.indexOf(`>${sym}<`);
        if (symIdx !== -1) {
          // Extract surrounding context (~300 chars)
          const chunk = html.slice(symIdx, symIdx + 300);
          const nums: number[] = [];
          const numRe = /[\d,]+\.?\d*/g;
          let nm: RegExpExecArray | null;
          while ((nm = numRe.exec(chunk)) !== null) {
            const n = parseFloat(nm[0].replace(',', ''));
            if (!isNaN(n) && n > 10) nums.push(n);
          }
          const changeRe = /([+-]?\d+\.?\d*)%/g;
          let cm: RegExpExecArray | null;
          let changePercent: number | null = null;
          while ((cm = changeRe.exec(chunk)) !== null) {
            changePercent = parseFloat(cm[1]);
          }
          const price = nums.length > 0 ? nums[0] : null;
          let direction: 'up' | 'down' | 'flat' | null = null;
          if (changePercent !== null) {
            if (changePercent > 0.05) direction = 'up';
            else if (changePercent < -0.05) direction = 'down';
            else direction = 'flat';
          }
          futures.push({ symbol: sym, name, price, changePercent, direction, lastUpdated: now });
        }
      }
    }

    const result: FinvizResult<FinvizFuture> = {
      data: futures,
      lastUpdated: now,
    };
    setCached(cacheKey, result);
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      data: [],
      sourceError: `Finviz futures fetch failed: ${msg}`,
      lastUpdated: now,
    };
  }
}
