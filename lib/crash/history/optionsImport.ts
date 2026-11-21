/**
 * Provider-neutral historical options import: one normalized row shape,
 * adapters for the common vendor end-of-day formats, and validation.
 *
 * Adapters follow each vendor's published column documentation. They have
 * not been run against purchased files in this repository (none are
 * included: licensed data must not be committed or redistributed), so the
 * first import of a new vendor file should be checked against the vendor's
 * own viewer. Units that differ by vendor are normalized here:
 *  - IV as a decimal; theta per share per calendar day; vega per share per
 *    1 vol point; multiplier 100 unless the vendor says otherwise.
 *  - ORATS publishes call Greeks per strike row; put Greeks are recomputed
 *    with Black-Scholes from ORATS' put mid IV and marked as such.
 */
import { blackScholes } from '../pricing';

export interface HistoricalOptionRow {
  tradeDate: string;
  /** Time of the quote snapshot if the vendor states one (e.g. 15:45 ET). */
  quoteTime: string | null;
  underlying: string;
  optionSymbol: string;
  type: 'put' | 'call';
  strike: number;
  expiration: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number | null;
  openInterest: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  underlyingPrice: number | null;
  multiplier: number;
  source: string;
  greeksNote?: string;
}

export type VendorFormat = 'orats' | 'historicaloptiondata' | 'cboe-datashop' | 'tradevi-snapshot';

export const VENDOR_LABEL: Record<VendorFormat, string> = {
  orats: 'ORATS (strikes history)',
  historicaloptiondata: 'HistoricalOptionData.com (EOD)',
  'cboe-datashop': 'Cboe DataShop (Option EOD Summary)',
  'tradevi-snapshot': 'Tradevi daily snapshot (Tradier)',
};

/** Minimal RFC 4180 CSV parser (quoted fields, embedded commas and quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((x) => x.trim() !== '')) rows.push(row);
  }
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().replace(/^﻿/, ''));
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** YYYY-MM-DD from YYYY-MM-DD, YYYYMMDD or M/D/YYYY. */
export function normDate(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim().slice(0, 10);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(t.slice(0, 8));
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s.trim());
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

const num = (s: string | undefined): number | null => {
  if (s == null || s === '' || /^(nan|null|n\/a)$/i.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

/** OCC symbol: ROOT (≤6) + YYMMDD + C/P + strike × 1000 (8 digits). */
export function occSymbol(root: string, expiration: string, type: 'put' | 'call', strike: number): string {
  const d = expiration.replace(/-/g, '').slice(2);
  return `${root.toUpperCase()}${d}${type === 'put' ? 'P' : 'C'}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}

export function parseOcc(sym: string): { root: string; expiration: string; type: 'put' | 'call'; strike: number } | null {
  const m = /^([A-Z.]{1,6})\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym.trim().toUpperCase());
  if (!m) return null;
  return { root: m[1], expiration: `20${m[2]}-${m[3]}-${m[4]}`, type: m[5] === 'P' ? 'put' : 'call', strike: Number(m[6]) / 1000 };
}

const yearsBetween = (a: string, b: string) => Math.max(0, (Date.parse(`${b}T20:00:00Z`) - Date.parse(`${a}T20:00:00Z`)) / (365 * 86_400_000));

function fromHod(r: Record<string, string>): HistoricalOptionRow | null {
  const tradeDate = normDate(r.DataDate ?? r.quotedate);
  const expiration = normDate(r.Expiration ?? r.expiration);
  const strike = num(r.Strike ?? r.strike);
  const typeRaw = (r.Type ?? r.type ?? '').toLowerCase();
  if (!tradeDate || !expiration || strike == null || !/^(put|call|p|c)$/.test(typeRaw)) return null;
  const type = typeRaw.startsWith('p') ? 'put' : 'call';
  const underlying = (r.UnderlyingSymbol ?? r.underlying ?? '').toUpperCase();
  return {
    tradeDate,
    quoteTime: null,
    underlying,
    optionSymbol: (r.OptionSymbol || occSymbol(underlying, expiration, type, strike)).replace(/\s+/g, ''),
    type,
    strike,
    expiration,
    bid: num(r.Bid),
    ask: num(r.Ask),
    last: num(r.Last),
    volume: num(r.Volume),
    openInterest: num(r.OpenInterest),
    iv: num(r.IV),
    delta: num(r.Delta),
    gamma: num(r.Gamma),
    theta: num(r.Theta),
    vega: num(r.Vega),
    underlyingPrice: num(r.UnderlyingPrice),
    multiplier: 100,
    source: VENDOR_LABEL.historicaloptiondata,
  };
}

function fromOrats(r: Record<string, string>, rate = 0.03): HistoricalOptionRow | null {
  const tradeDate = normDate(r.trade_date ?? r.tradeDate);
  const expiration = normDate(r.expirDate);
  const strike = num(r.strike);
  const S = num(r.stkPx) ?? num(r.spot_px);
  const underlying = (r.ticker ?? '').toUpperCase();
  if (!tradeDate || !expiration || strike == null || !underlying) return null;
  const iv = num(r.pMidIv) ?? num(r.smvVol);
  const T = yearsBetween(tradeDate, expiration);
  const rr = num(r.iRate) ?? rate;
  const q = num(r.divRate) ?? 0;
  const g = S != null && iv != null && iv > 0 && T > 0 ? blackScholes({ type: 'put', S, K: strike, T, r: rr > 1 ? rr / 100 : rr, q: q > 1 ? q / 100 : q, sigma: iv }) : null;
  return {
    tradeDate,
    quoteTime: null,
    underlying,
    optionSymbol: occSymbol(underlying, expiration, 'put', strike),
    type: 'put',
    strike,
    expiration,
    bid: num(r.pBidPx),
    ask: num(r.pAskPx),
    last: null,
    volume: num(r.pVolu),
    openInterest: num(r.pOi),
    iv,
    delta: g?.delta ?? null,
    gamma: g?.gamma ?? null,
    theta: g?.theta ?? null,
    vega: g?.vega ?? null,
    underlyingPrice: S,
    multiplier: 100,
    source: VENDOR_LABEL.orats,
    greeksNote: 'Put Greeks recomputed (Black-Scholes) from ORATS put mid IV',
  };
}

function fromCboe(r: Record<string, string>): HistoricalOptionRow | null {
  const tradeDate = normDate(r.quote_date);
  const expiration = normDate(r.expiration);
  const strike = num(r.strike);
  const t = (r.option_type ?? '').toUpperCase();
  const underlying = (r.underlying_symbol ?? '').replace(/^\^/, '').toUpperCase();
  if (!tradeDate || !expiration || strike == null || (t !== 'P' && t !== 'C')) return null;
  const type = t === 'P' ? 'put' : 'call';
  const ub = num(r.underlying_bid_1545);
  const ua = num(r.underlying_ask_1545);
  const S = num(r.active_underlying_price_1545) ?? (ub != null && ua != null ? (ub + ua) / 2 : null);
  const root = (r.root || underlying).toUpperCase();
  return {
    tradeDate,
    quoteTime: '15:45 ET',
    underlying,
    optionSymbol: occSymbol(root, expiration, type, strike),
    type,
    strike,
    expiration,
    bid: num(r.bid_1545),
    ask: num(r.ask_1545),
    last: num(r.close),
    volume: num(r.trade_volume),
    openInterest: num(r.open_interest),
    iv: num(r.implied_volatility_1545),
    delta: num(r.delta_1545),
    gamma: num(r.gamma_1545),
    theta: num(r.theta_1545),
    vega: num(r.vega_1545),
    underlyingPrice: S,
    // A root that differs from the underlying usually marks an adjusted contract.
    multiplier: root !== underlying ? NaN : 100,
    source: VENDOR_LABEL['cboe-datashop'],
  };
}

function fromSnapshot(r: Record<string, string>): HistoricalOptionRow | null {
  const tradeDate = normDate(r.trade_date);
  const expiration = normDate(r.expiration);
  const strike = num(r.strike);
  const type = r.option_type === 'call' ? 'call' : r.option_type === 'put' ? 'put' : null;
  if (!tradeDate || !expiration || strike == null || !type) return null;
  return {
    tradeDate,
    quoteTime: r.captured_at || null,
    underlying: (r.underlying ?? '').toUpperCase(),
    optionSymbol: r.option_symbol,
    type,
    strike,
    expiration,
    bid: num(r.bid),
    ask: num(r.ask),
    last: num(r.last),
    volume: num(r.volume),
    openInterest: num(r.open_interest),
    iv: num(r.iv),
    delta: num(r.delta),
    gamma: num(r.gamma),
    theta: num(r.theta),
    vega: num(r.vega),
    underlyingPrice: num(r.underlying_price),
    multiplier: 100,
    source: VENDOR_LABEL['tradevi-snapshot'],
  };
}

/** Guess the vendor format from the header row. */
export function detectFormat(header: string[]): VendorFormat | null {
  const h = new Set(header);
  if (h.has('pBidPx') && h.has('expirDate')) return 'orats';
  if (h.has('quote_date') && h.has('bid_1545')) return 'cboe-datashop';
  if (h.has('trade_date') && h.has('option_symbol')) return 'tradevi-snapshot';
  if (h.has('DataDate') && h.has('OptionSymbol')) return 'historicaloptiondata';
  return null;
}

export function normalizeRows(records: Record<string, string>[], format: VendorFormat): { rows: HistoricalOptionRow[]; unparsed: number } {
  const fn = { orats: fromOrats, historicaloptiondata: fromHod, 'cboe-datashop': fromCboe, 'tradevi-snapshot': fromSnapshot }[format];
  const rows: HistoricalOptionRow[] = [];
  let unparsed = 0;
  for (const r of records) {
    const x = fn(r);
    if (x) rows.push(x);
    else unparsed++;
  }
  return { rows, unparsed };
}

// ─── Validation ────────────────────────────────────────────────────────────

export interface ValidationReport {
  total: number;
  accepted: number;
  rejected: number;
  rejections: Record<string, number>;
  warnings: Record<string, number>;
  dates: { first: string | null; last: string | null; count: number; missingSessions: string[] };
  underlyings: string[];
}

export interface ValidationOptions {
  /** Trading calendar (e.g. SPY sessions) to find missing dates. */
  sessions?: string[];
  /** Keep only puts (default true). */
  putsOnly?: boolean;
}

export function validateRows(rows: HistoricalOptionRow[], opts: ValidationOptions = {}): { accepted: HistoricalOptionRow[]; report: ValidationReport } {
  const rejections: Record<string, number> = {};
  const warnings: Record<string, number> = {};
  const bump = (m: Record<string, number>, k: string) => {
    m[k] = (m[k] ?? 0) + 1;
  };
  const seen = new Set<string>();
  const accepted: HistoricalOptionRow[] = [];
  const history = new Map<string, { bid: number | null; ask: number | null; same: number }>();
  const sorted = [...rows].sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0));

  let considered = 0;
  for (const r of sorted) {
    const reasons: string[] = [];
    if (opts.putsOnly !== false && r.type !== 'put') continue;
    considered++;
    const key = `${r.tradeDate}|${r.optionSymbol}`;
    if (seen.has(key)) reasons.push('Duplicate observation');
    seen.add(key);
    const occ = parseOcc(r.optionSymbol);
    if (!occ) reasons.push('Invalid option symbol');
    else {
      if (occ.expiration !== r.expiration) reasons.push('Expiration does not match the symbol');
      if (Math.abs(occ.strike - r.strike) > 1e-6) reasons.push('Strike does not match the symbol');
      if (occ.type !== r.type) reasons.push('Type does not match the symbol');
    }
    if (r.expiration < r.tradeDate) reasons.push('Expired before the trade date');
    if (!(r.multiplier === 100)) reasons.push('Non-standard multiplier or deliverable (adjusted contract)');
    if (r.bid == null || r.ask == null) reasons.push('Missing bid/ask');
    else {
      if (r.bid < 0 || r.ask < 0) reasons.push('Negative price');
      if (r.ask < r.bid) reasons.push('Crossed quote');
      if (r.type === 'put' && r.ask > r.strike) reasons.push('Impossible price (put above strike)');
    }
    if (r.underlyingPrice == null || !(r.underlyingPrice > 0)) reasons.push('Missing underlying price');

    if (reasons.length) {
      reasons.forEach((x) => bump(rejections, x));
      continue;
    }
    const exDow = new Date(`${r.expiration}T12:00:00Z`).getUTCDay();
    if (exDow === 0 || (exDow === 6 && r.expiration >= '2015-02-01')) bump(warnings, 'Expiration on a weekend');
    if (r.delta == null || r.gamma == null || r.theta == null || r.vega == null) bump(warnings, 'Missing Greeks');
    if (r.iv == null || r.iv <= 0 || r.iv > 5) bump(warnings, 'Missing or implausible IV');
    if (r.underlyingPrice != null && r.bid != null && r.bid < Math.max(r.strike - r.underlyingPrice, 0) - 0.05) bump(warnings, 'Bid below intrinsic value (stale or wrong underlying)');
    const h = history.get(r.optionSymbol);
    if (h && h.bid === r.bid && h.ask === r.ask && !r.volume) {
      h.same += 1;
      if (h.same === 5) bump(warnings, 'Quote unchanged for 5 sessions with no volume (stale)');
    } else history.set(r.optionSymbol, { bid: r.bid, ask: r.ask, same: 0 });
    accepted.push(r);
  }

  const dates = Array.from(new Set(accepted.map((r) => r.tradeDate))).sort();
  const missing: string[] = [];
  if (opts.sessions && dates.length) {
    const have = new Set(dates);
    for (const d of opts.sessions) if (d >= dates[0] && d <= dates[dates.length - 1] && !have.has(d)) missing.push(d);
  }
  return {
    accepted,
    report: {
      total: rows.length,
      accepted: accepted.length,
      rejected: considered - accepted.length,
      rejections,
      warnings,
      dates: { first: dates[0] ?? null, last: dates[dates.length - 1] ?? null, count: dates.length, missingSessions: missing.slice(0, 200) },
      underlyings: Array.from(new Set(accepted.map((r) => r.underlying))).sort(),
    },
  };
}
