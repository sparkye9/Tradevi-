/**
 * Stooq daily bars — free, keyless CSV. Used as the fallback when Yahoo
 * refuses or rate-limits, since the Market Selector only needs daily OHLC.
 *
 *   https://stooq.com/q/d/l/?s=nq.f&i=d
 *   Date,Open,High,Low,Close,Volume
 *   2026-10-08,24750.25,24880.00,24700.50,24812.75,142133
 *
 * Volume is absent for some series, so the parser reads the header rather than
 * assuming a column count. Stooq dates carry no time; each bar is stamped at
 * 17:00 UTC (1:00 PM New York) so etDate() lands on the right trading day in
 * both EST and EDT, matching how Yahoo stamps its daily futures bars.
 */
import type { YFCandle } from './yahooChart';

const STOOQ_CSV = 'https://stooq.com/q/d/l/';
/** 1:00 PM ET, safely inside the ET calendar day whichever way the clocks are set. */
const STAMP_SECONDS = 17 * 3600;

export interface StooqResult {
  candles: YFCandle[];
  dataSource: 'stooq_eod';
}

function dayStamp(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const midnight = Date.UTC(Number(y), Number(mo) - 1, Number(d)) / 1000;
  if (!Number.isFinite(midnight)) return null;
  return midnight + STAMP_SECONDS;
}

/**
 * Parse a Stooq daily CSV export. Returns bars oldest → newest, skipping rows
 * that are malformed or non-positive. Throws when the payload is not a CSV
 * table at all (Stooq answers "Exceeded the daily hits limit" as plain text).
 */
export function parseStooqCsv(text: string): YFCandle[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error(`Stooq returned no rows (${lines[0]?.slice(0, 60) ?? 'empty response'})`);
  }
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iDate = col('date');
  const iOpen = col('open');
  const iHigh = col('high');
  const iLow = col('low');
  const iClose = col('close');
  const iVol = col('volume');
  if (iDate < 0 || iOpen < 0 || iHigh < 0 || iLow < 0 || iClose < 0) {
    throw new Error(`Stooq response is not a daily CSV table (header: ${lines[0].slice(0, 60)})`);
  }

  const candles: YFCandle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const time = dayStamp(cells[iDate] ?? '');
    if (time == null) continue;
    const open = Number(cells[iOpen]);
    const high = Number(cells[iHigh]);
    const low = Number(cells[iLow]);
    const close = Number(cells[iClose]);
    const volume = iVol >= 0 ? Number(cells[iVol]) : 0;
    if (![open, high, low, close].every((n) => Number.isFinite(n) && n > 0)) continue;
    if (high < low) continue;
    candles.push({ time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
  }
  if (candles.length === 0) throw new Error('Stooq CSV had no usable rows');
  candles.sort((a, b) => a.time - b.time);
  return candles;
}

/** Fetch daily bars for a Stooq symbol (e.g. "nq.f"). */
export async function fetchStooqDaily(symbol: string): Promise<StooqResult> {
  const url = `${STOOQ_CSV}?s=${encodeURIComponent(symbol)}&i=d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Tradevi/3.0)', Accept: 'text/csv,text/plain' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Stooq ${res.status} for ${symbol}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error(`Stooq returned an HTML page for ${symbol} — rate-limited or unknown symbol`);
  }
  return { candles: parseStooqCsv(text), dataSource: 'stooq_eod' };
}
