/**
 * Stooq market data client — free, no API key required.
 * Provides EOD quotes and historical OHLCV candles via CSV API.
 * Server-side only.
 */

import type { CandleData } from './types';

const STOOQ_BASE = 'https://stooq.com';

// Stooq uses SYMBOL.US suffix for US equities/ETFs
function stooqSym(symbol: string): string {
  const s = symbol.toUpperCase();
  // Already has an exchange suffix
  if (s.includes('.')) return s;
  return `${s}.US`;
}

function parseCsv(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim(); });
    return row;
  });
}

function toTimestamp(date: string, time = '00:00:00'): number {
  // date may be YYYY-MM-DD or YYYYMMDD
  const d = date.length === 8
    ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    : date;
  return Math.floor(new Date(`${d}T${time}Z`).getTime() / 1000);
}

function startDate(period: string): string {
  const days: Record<string, number> = {
    '1d': 2, '5d': 7, '1mo': 33, '3mo': 96,
    '6mo': 186, '1y': 370, '2y': 740, '5y': 1830,
  };
  const ms = (days[period] ?? 96) * 86400 * 1000;
  return new Date(Date.now() - ms).toISOString().split('T')[0].replace(/-/g, '');
}

const INTERVAL_MAP: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '30m': '30',
  '60m': '60', '1h': '60',
  '1d': 'd', '5d': 'd', '1wk': 'w', '1mo': 'm',
};

// ─── Quote ────────────────────────────────────────────────────────────────────

export interface StooqQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePercent: number;
  volume: number;
  dataSource: 'stooq';
  fetchedAt: string;
}

export async function fetchStooqQuote(symbol: string): Promise<StooqQuote> {
  const sym = stooqSym(symbol);
  const url = `${STOOQ_BASE}/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2ohlcv&h&e=csv`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Stooq ${res.status}`);

  const text = await res.text();
  if (!text || text.toLowerCase().includes('no data')) {
    throw new Error(`No quote data for ${symbol} from Stooq`);
  }

  const rows = parseCsv(text);
  if (!rows.length) throw new Error(`Empty quote response for ${symbol} from Stooq`);

  // Stooq returns latest bar first; row 0 = today, row 1 = yesterday
  const today = rows[0];
  const prev = rows[1];
  const price = parseFloat(today['Close'] ?? '0') || 0;
  if (!price) throw new Error(`Zero price for ${symbol} from Stooq`);

  const prevClose = prev ? parseFloat(prev['Close'] ?? '0') || price : price;
  const change = price - prevClose;

  return {
    symbol: symbol.toUpperCase(),
    price,
    open: parseFloat(today['Open'] ?? '0') || 0,
    high: parseFloat(today['High'] ?? '0') || 0,
    low: parseFloat(today['Low'] ?? '0') || 0,
    prevClose,
    change,
    changePercent: prevClose > 0 ? (change / prevClose) * 100 : 0,
    volume: parseFloat(today['Volume'] ?? '0') || 0,
    dataSource: 'stooq',
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Candles ──────────────────────────────────────────────────────────────────

export interface StooqChartResult {
  candles: CandleData[];
  dataSource: 'stooq';
}

export async function fetchStooqCandles(
  symbol: string,
  period = '3mo',
  interval = '1d',
): Promise<StooqChartResult> {
  const sym = stooqSym(symbol);
  const i = INTERVAL_MAP[interval] ?? 'd';
  const d1 = startDate(period);
  const d2 = new Date().toISOString().split('T')[0].replace(/-/g, '');

  const url = `${STOOQ_BASE}/q/d/l/?s=${encodeURIComponent(sym)}&d1=${d1}&d2=${d2}&i=${i}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Stooq ${res.status}`);

  const text = await res.text();
  if (!text || text.toLowerCase().includes('no data')) {
    throw new Error(`No candle data for ${symbol} from Stooq`);
  }

  const rows = parseCsv(text);
  if (!rows.length) throw new Error(`Empty candle response for ${symbol} from Stooq`);

  const candles: CandleData[] = rows
    .map(row => ({
      time: toTimestamp(row['Date'] ?? '', row['Time']),
      open: parseFloat(row['Open'] ?? '0') || 0,
      high: parseFloat(row['High'] ?? '0') || 0,
      low: parseFloat(row['Low'] ?? '0') || 0,
      close: parseFloat(row['Close'] ?? '0') || 0,
      volume: parseFloat(row['Volume'] ?? '0') || 0,
    }))
    .filter(c => c.open > 0 && c.close > 0)
    .sort((a, b) => a.time - b.time);

  if (!candles.length) throw new Error(`No valid candles for ${symbol} from Stooq`);

  return { candles, dataSource: 'stooq' };
}
