import { NextRequest, NextResponse } from 'next/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinvizStock {
  symbol: string;
  company: string;
  sector: string;
  industry: string;
  price: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: string;
  pe: string;
  country: string;
}

// ─── Module-level cache ───────────────────────────────────────────────────────

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cachedStocks: { data: FinvizStock[]; ts: number; elite: boolean } | null = null;

// ─── Screener fetch ───────────────────────────────────────────────────────────

async function fetchScreener(maxPrice: number, minAvgVol: string): Promise<FinvizStock[]> {
  const apiKey = process.env.FINVIZ_API_KEY;

  // Price bucket mapping for FINviz filter codes
  const priceFilter =
    maxPrice <=  5  ? 'sh_price_u5'  :
    maxPrice <= 10  ? 'sh_price_u10' :
    maxPrice <= 20  ? 'sh_price_u20' :
    maxPrice <= 30  ? 'sh_price_u30' :
    maxPrice <= 50  ? 'sh_price_u50' : '';

  const volFilter = `sh_avgvol_o${minAvgVol}`;
  const filters   = [volFilter, priceFilter].filter(Boolean).join(',');

  const base   = apiKey ? 'https://elite.finviz.com' : 'https://finviz.com';
  const auth   = apiKey ? `&auth=${encodeURIComponent(apiKey)}` : '';
  const url    = `${base}/export.ashx?v=111&f=${filters}&o=-volume&r=1${auth}`;

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':     'text/csv,text/plain,*/*',
      'Referer':    'https://finviz.com/screener.ashx',
    },
    cache: 'no-store',
  });
  if (!resp.ok) throw new Error(`FINviz returned HTTP ${resp.status}`);

  const text = await resp.text();
  return parseCSV(text);
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(csv: string): FinvizStock[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const stocks: FinvizStock[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells  = splitCSVRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').replace(/"/g, '').trim(); });

    const price = parseFloat(row['Price'] ?? '0');
    if (!row['Ticker'] || !isFinite(price) || price <= 0) continue;

    const changePct = parseFloat((row['Change'] ?? '0%').replace('%', ''));
    const volume    = parseVolume(row['Volume'] ?? '0');
    const avgVolume = parseVolume(row['Avg Volume'] ?? row['Average Volume'] ?? '0');

    stocks.push({
      symbol:    row['Ticker'],
      company:   row['Company']  ?? '',
      sector:    row['Sector']   ?? '',
      industry:  row['Industry'] ?? '',
      country:   row['Country']  ?? '',
      price,
      changePct: isFinite(changePct) ? changePct : 0,
      volume,
      avgVolume,
      marketCap: row['Market Cap'] ?? '',
      pe:        row['P/E']        ?? '',
    });
  }

  return stocks;
}

function splitCSVRow(row: string): string[] {
  const cells: string[] = [];
  let cur = '', inQ = false;
  for (const ch of row) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

function parseVolume(s: string): number {
  const clean = s.replace(/,/g, '').trim();
  if (clean.endsWith('B')) return parseFloat(clean) * 1_000_000_000;
  if (clean.endsWith('M')) return parseFloat(clean) * 1_000_000;
  if (clean.endsWith('K')) return parseFloat(clean) * 1_000;
  return parseInt(clean, 10) || 0;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp       = req.nextUrl.searchParams;
  const maxPrice = parseFloat(sp.get('maxPrice') ?? '20');
  const minVol   = sp.get('minVol') ?? '1000'; // FINviz code: 1000 = 1M
  const bust     = sp.get('bust') === '1';

  // Serve from cache when fresh and params match
  if (!bust && cachedStocks && Date.now() - cachedStocks.ts < CACHE_TTL) {
    return NextResponse.json({
      stocks:    cachedStocks.data,
      cached:    true,
      elite:     cachedStocks.elite,
      fetchedAt: new Date(cachedStocks.ts).toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const stocks = await fetchScreener(maxPrice, minVol);
    const elite  = !!process.env.FINVIZ_API_KEY;
    cachedStocks = { data: stocks.slice(0, 30), ts: Date.now(), elite };

    return NextResponse.json({
      stocks:    cachedStocks.data,
      cached:    false,
      elite,
      fetchedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('[FINviz screener]', err);
    return NextResponse.json(
      { stocks: [], error: err?.message ?? 'FINviz screener unavailable', elite: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
