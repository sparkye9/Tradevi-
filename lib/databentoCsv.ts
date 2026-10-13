/**
 * Parse Databento OHLCV CSV exports (schema ohlcv-1m / ohlcv-1h / ohlcv-1d).
 *
 * Works with files from the download script (scripts/databento-download.ts)
 * and with CSVs exported from the Databento web portal. Handles both forms
 * Databento can emit:
 *   - prices as decimals (pretty_px) or as 1e-9 fixed-point integers
 *   - ts_event as ISO-8601 (pretty_ts, nanosecond fraction allowed) or as
 *     nanoseconds since the epoch
 *
 * Databento's ohlcv-1m only emits a bar for minutes with trades; quiet
 * minutes are simply absent (not zero-filled).
 *
 * When a file holds several contracts (e.g. a parent "MNQ.FUT" request), the
 * contract with the most volume on each CME session date is kept — a
 * volume roll — and every day's choice is reported.
 */
import type { Candle } from './indicators';
import { sessionStamp } from './structure';

export interface DatabentoParse {
  bars: Candle[];
  symbols: string[];
  /** Contract used per session date when the file had more than one. */
  rollLog: { session: string; symbol: string }[];
  rows: number;
  skipped: number;
  warnings: string[];
}

const FIXED = 1e9;

function parsePrice(raw: string): number {
  const t = raw.trim();
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  // Fixed-point integers (price × 1e9) have no decimal point and are huge.
  if (!t.includes('.') && Math.abs(n) >= 1e9) return n / FIXED;
  return n;
}

/** Unix seconds from ISO (any fraction length) or epoch nanoseconds. */
export function parseTs(raw: string): number {
  const t = raw.trim().replace(/^"|"$/g, '');
  if (/^\d{15,20}$/.test(t)) return Math.floor(Number(BigInt(t) / BigInt(1000000)) / 1000);
  // Trim fractional seconds to milliseconds so Date.parse accepts it.
  const iso = t.replace(/(\.\d{3})\d+/, '$1').replace(' ', 'T');
  const ms = Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
}

export function parseDatabentoCsv(text: string): DatabentoParse {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) throw new Error('File has no data rows.');
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const col = (n: string) => header.indexOf(n);
  const iTs = col('ts_event') >= 0 ? col('ts_event') : col('ts_recv');
  const [iO, iH, iL, iC, iV] = ['open', 'high', 'low', 'close', 'volume'].map(col);
  const iSym = col('symbol') >= 0 ? col('symbol') : col('instrument_id');
  if (iTs < 0 || iO < 0 || iH < 0 || iL < 0 || iC < 0) {
    throw new Error(`Not a Databento OHLCV CSV (header: ${lines[0].slice(0, 80)}). Export schema ohlcv-1m as CSV.`);
  }
  if (iSym < 0) warnings.push('No symbol column — treating the file as one contract.');

  // symbol → time → bar
  const bySym = new Map<string, Map<number, Candle>>();
  let skipped = 0;
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k].split(',');
    const time = parseTs(c[iTs] ?? '');
    const o = parsePrice(c[iO] ?? ''), h = parsePrice(c[iH] ?? ''), l = parsePrice(c[iL] ?? ''), cl = parsePrice(c[iC] ?? '');
    const v = iV >= 0 ? Number(c[iV]) : 0;
    if (!Number.isFinite(time) || ![o, h, l, cl].every((x) => Number.isFinite(x) && x > 0) || h < l) { skipped++; continue; }
    const sym = iSym >= 0 ? (c[iSym] ?? '').trim().replace(/"/g, '') || 'UNKNOWN' : 'ONE';
    let m = bySym.get(sym);
    if (!m) bySym.set(sym, (m = new Map()));
    m.set(time, { time, open: o, high: h, low: l, close: cl, volume: Number.isFinite(v) ? v : 0 });
  }
  if (skipped) warnings.push(`${skipped} malformed row(s) skipped.`);
  const symbols = Array.from(bySym.keys()).sort();
  if (!symbols.length) throw new Error('No usable rows in the file.');

  let bars: Candle[] = [];
  const rollLog: DatabentoParse['rollLog'] = [];
  if (symbols.length === 1) {
    bars = Array.from(bySym.get(symbols[0])!.values());
  } else {
    // Volume per symbol per session; keep the most-traded contract each session.
    const volBy = new Map<string, Map<string, number>>();
    for (const [sym, m] of Array.from(bySym.entries())) {
      for (const b of Array.from(m.values())) {
        const s = sessionStamp(b.time).session;
        const row = volBy.get(s) ?? new Map<string, number>();
        row.set(sym, (row.get(sym) ?? 0) + b.volume);
        volBy.set(s, row);
      }
    }
    const pick = new Map<string, string>();
    for (const s of Array.from(volBy.keys()).sort()) {
      const best = Array.from(volBy.get(s)!.entries()).sort((a, b) => b[1] - a[1])[0][0];
      pick.set(s, best);
      if (!rollLog.length || rollLog[rollLog.length - 1].symbol !== best) rollLog.push({ session: s, symbol: best });
    }
    for (const [sym, m] of Array.from(bySym.entries())) for (const b of Array.from(m.values())) if (pick.get(sessionStamp(b.time).session) === sym) bars.push(b);
    warnings.push(`File has ${symbols.length} contracts; used the highest-volume one each session (${rollLog.length} roll point(s)). Prices are not back-adjusted.`);
  }
  bars.sort((a, b) => a.time - b.time);
  return { bars, symbols, rollLog, rows: lines.length - 1, skipped, warnings };
}

/** Aggregate 1-minute bars into N-minute bars aligned to the clock (ET offsets are whole hours). */
export function aggregateMinutes(bars: Candle[], minutes: number): Candle[] {
  const size = minutes * 60;
  const out: Candle[] = [];
  for (const b of bars) {
    const t = Math.floor(b.time / size) * size;
    const cur = out[out.length - 1];
    if (cur && cur.time === t) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    } else out.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
  }
  return out;
}
