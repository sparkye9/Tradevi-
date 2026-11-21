/**
 * Historical trade execution engine for one put position.
 *
 * Prices come from a `ContractPricer`: an actual historical chain when one is
 * loaded, otherwise the THEORETICAL model (results are then labelled
 * theoretical). Data are daily closes, so:
 *  - every exit is evaluated at a close and filled at that close's bid (or
 *    mid if chosen); a target or stop crossed between closes fills at the
 *    next close actually available, which can be well past the threshold
 *    (a gap-through), never at the threshold itself;
 *  - a midpoint or limit order fills only when that day's ask is at or below
 *    the limit; otherwise it waits up to `limitDays` sessions and may never
 *    fill.
 */
import type { Regime } from '../regime';

export interface Quote {
  date: string;
  S: number;
  bid: number;
  ask: number;
  mid: number;
  iv: number | null;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
}

export interface ContractPricer {
  kind: 'actual' | 'theoretical';
  symbol: string;
  strike: number;
  expiration: string;
  /** Quote at that date's close, or null if none. */
  quote(date: string): Quote | null;
}

export type EntryMethod = 'ask' | 'mid' | 'limit' | 'custom';

export interface ExitRules {
  /** Take profit at +x (1 = +100%). */
  profitTarget: number | null;
  /** Exit at −x of premium (0.5 = −50%). 1 = hold to zero. */
  maxLoss: number | null;
  /** Exit when the underlying closes at or below this price. */
  underlyingTarget: number | null;
  /** Exit when VIX closes at or above this level (volatility expansion). */
  vixAbove: number | null;
  /** Exit when the regime reaches BREAKDOWN CONFIRMED or worse. */
  onBreakdown: boolean;
  /** Exit after this many calendar days. */
  maxHoldDays: number | null;
  /** Exit on (or at the first session after) this date. */
  manualExit: string | null;
  /** Sell before the last week to avoid expiry risk (calendar days before expiration). */
  exitDaysBeforeExpiry: number | null;
}

export const DEFAULT_EXITS: ExitRules = {
  profitTarget: 2,
  maxLoss: 0.5,
  underlyingTarget: null,
  vixAbove: null,
  onBreakdown: false,
  maxHoldDays: null,
  manualExit: null,
  exitDaysBeforeExpiry: 5,
};

export interface TradeInput {
  pricer: ContractPricer;
  /** Sessions from the entry date on, in order. */
  sessions: string[];
  entry: { method: EntryMethod; price?: number; limitDays?: number };
  exitFill: 'bid' | 'mid';
  contracts: number;
  feePerContract: number;
  exits: ExitRules;
  /** Context for regime / VIX exits. */
  context?: (date: string) => { regime: Regime | null; vix: number | null } | null;
}

export interface PathPoint {
  date: string;
  S: number;
  mark: number;
  exitValue: number;
  pnl: number;
  iv: number | null;
}

export type ExitReason =
  | 'profit target'
  | 'max loss'
  | 'underlying target'
  | 'volatility expansion'
  | 'technical breakdown'
  | 'time exit'
  | 'manual exit'
  | 'pre-expiry exit'
  | 'expiration'
  | 'data ended';

export interface TradeResult {
  kind: 'actual' | 'theoretical';
  filled: boolean;
  unfilledReason?: string;
  fillWarnings: string[];
  entryDate: string | null;
  entryPremium: number | null;
  entryS: number | null;
  entryIv: number | null;
  entryGreeks: { delta: number | null; gamma: number | null; theta: number | null; vega: number | null } | null;
  contracts: number;
  capital: number | null;
  exitDate: string | null;
  exitPremium: number | null;
  exitReason: ExitReason | null;
  /** Threshold crossed between closes: the fill was past the target or stop. */
  gapThrough: boolean;
  gross: number | null;
  fees: number;
  net: number | null;
  returnPct: number | null;
  holdingDays: number | null;
  mfe: number | null;
  mae: number | null;
  maxDrawdown: number | null;
  /** Net P/L per dollar deployed per 30 days held. */
  capitalEfficiency: number | null;
  holdToExpiry: { value: number | null; net: number | null; returnPct: number | null; date: string | null } | null;
  path: PathPoint[];
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const BREAKDOWN_OR_WORSE: Regime[] = ['BREAKDOWN CONFIRMED', 'VOLATILITY EXPANSION', 'PANIC / LATE ENTRY'];

export function simulateTrade(t: TradeInput): TradeResult {
  const n = Math.max(1, Math.floor(t.contracts));
  const base: TradeResult = {
    kind: t.pricer.kind,
    filled: false,
    fillWarnings: [],
    entryDate: null,
    entryPremium: null,
    entryS: null,
    entryIv: null,
    entryGreeks: null,
    contracts: n,
    capital: null,
    exitDate: null,
    exitPremium: null,
    exitReason: null,
    gapThrough: false,
    gross: null,
    fees: 0,
    net: null,
    returnPct: null,
    holdingDays: null,
    mfe: null,
    mae: null,
    maxDrawdown: null,
    capitalEfficiency: null,
    holdToExpiry: null,
    path: [],
  };
  const live = t.sessions.filter((d) => d <= t.pricer.expiration);
  if (!live.length) return { ...base, unfilledReason: 'No sessions before expiration' };

  // ── Entry ──
  let entryIdx = -1;
  let entry = 0;
  const first = t.pricer.quote(live[0]);
  if (!first) return { ...base, unfilledReason: `No quote on ${live[0]}` };
  if (t.entry.method === 'ask') {
    entryIdx = 0;
    entry = first.ask;
  } else {
    const limit = t.entry.method === 'mid' ? first.mid : t.entry.price ?? first.mid;
    const days = Math.max(1, t.entry.limitDays ?? 1);
    for (let i = 0; i < Math.min(days, live.length); i++) {
      const q = i === 0 ? first : t.pricer.quote(live[i]);
      if (q && q.ask <= limit + 1e-9) {
        entryIdx = i;
        entry = q.ask < limit ? q.ask : limit;
        break;
      }
    }
    if (entryIdx < 0) {
      return { ...base, unfilledReason: `Limit $${limit.toFixed(2)} was below the ask on every session tried (${days}); daily data cannot show an intraday fill, so none is assumed.` };
    }
    if (entryIdx === 0 && t.entry.method === 'mid' && first.ask > first.mid) {
      base.fillWarnings.push('Midpoint fill not verifiable from daily data.');
    }
  }
  const eq = entryIdx === 0 ? first : t.pricer.quote(live[entryIdx])!;
  if (!(entry > 0)) return { ...base, unfilledReason: 'Entry price is zero' };
  const entryDate = live[entryIdx];
  const cost = entry * 100 * n;
  const entryFee = t.feePerContract * n;

  // ── Hold ──
  const path: PathPoint[] = [];
  let exitIdx = -1;
  let reason: ExitReason | null = null;
  let exitPx = 0;
  let gap = false;
  let peak = cost;
  let maxDD = 0;
  let mfe = -Infinity;
  let mae = Infinity;
  for (let i = entryIdx; i < live.length; i++) {
    const d = live[i];
    const q = i === entryIdx ? eq : t.pricer.quote(d);
    if (!q) continue;
    const isExpiry = d >= t.pricer.expiration;
    const intrinsic = Math.max(t.pricer.strike - q.S, 0);
    const exitValue = isExpiry ? intrinsic : t.exitFill === 'mid' ? q.mid : q.bid;
    const pnl = (exitValue - entry) * 100 * n;
    const markPnl = ((isExpiry ? intrinsic : q.mid) - entry) * 100 * n;
    path.push({ date: d, S: q.S, mark: isExpiry ? intrinsic : q.mid, exitValue, pnl, iv: q.iv });
    mfe = Math.max(mfe, markPnl);
    mae = Math.min(mae, markPnl);
    const val = cost + markPnl;
    peak = Math.max(peak, val);
    maxDD = Math.max(maxDD, peak > 0 ? (peak - val) / peak : 0);
    if (i === entryIdx) continue;

    const ret = exitValue / entry - 1;
    const ctx = t.context?.(d) ?? null;
    const x = t.exits;
    let r: ExitReason | null = null;
    if (isExpiry) r = 'expiration';
    else if (x.manualExit && d >= x.manualExit) r = 'manual exit';
    else if (x.maxLoss != null && x.maxLoss < 1 && ret <= -x.maxLoss) {
      r = 'max loss';
      gap = ret < -x.maxLoss - 0.02;
    } else if (x.profitTarget != null && ret >= x.profitTarget) {
      r = 'profit target';
      gap = ret > x.profitTarget + 0.02;
    } else if (x.underlyingTarget != null && q.S <= x.underlyingTarget) r = 'underlying target';
    else if (x.vixAbove != null && ctx?.vix != null && ctx.vix >= x.vixAbove) r = 'volatility expansion';
    else if (x.onBreakdown && ctx?.regime && BREAKDOWN_OR_WORSE.includes(ctx.regime)) r = 'technical breakdown';
    else if (x.maxHoldDays != null && dayDiff(entryDate, d) >= x.maxHoldDays) r = 'time exit';
    else if (x.exitDaysBeforeExpiry != null && dayDiff(d, t.pricer.expiration) <= x.exitDaysBeforeExpiry) r = 'pre-expiry exit';
    if (r) {
      exitIdx = i;
      reason = r;
      exitPx = exitValue;
      break;
    }
  }
  if (exitIdx < 0) {
    const lastP = path[path.length - 1];
    if (!lastP) return { ...base, unfilledReason: 'No quotes after entry' };
    exitIdx = live.indexOf(lastP.date);
    reason = lastP.date >= t.pricer.expiration ? 'expiration' : 'data ended';
    exitPx = lastP.exitValue;
  }
  const exitDate = live[exitIdx];
  const exitFee = exitPx > 0 ? t.feePerContract * n : 0;
  const gross = (exitPx - entry) * 100 * n;
  const fees = entryFee + exitFee;
  const net = gross - fees;
  const holdingDays = dayDiff(entryDate, exitDate);

  // Hold to expiration: intrinsic value on the last session on or before expiry.
  let hte: TradeResult['holdToExpiry'] = null;
  const expSessions = t.sessions.filter((d) => d <= t.pricer.expiration);
  const lastSession = expSessions[expSessions.length - 1];
  if (lastSession && dayDiff(lastSession, t.pricer.expiration) <= 3) {
    const q = t.pricer.quote(lastSession);
    if (q) {
      const v = Math.max(t.pricer.strike - q.S, 0);
      const hNet = (v - entry) * 100 * n - entryFee - (v > 0 ? t.feePerContract * n : 0);
      hte = { value: v, net: hNet, returnPct: hNet / (cost + entryFee), date: lastSession };
    }
  } else {
    hte = { value: null, net: null, returnPct: null, date: null };
  }

  return {
    ...base,
    filled: true,
    entryDate,
    entryPremium: entry,
    entryS: eq.S,
    entryIv: eq.iv,
    entryGreeks: { delta: eq.delta ?? null, gamma: eq.gamma ?? null, theta: eq.theta ?? null, vega: eq.vega ?? null },
    capital: cost + entryFee,
    exitDate,
    exitPremium: exitPx,
    exitReason: reason,
    gapThrough: gap,
    gross,
    fees,
    net,
    returnPct: net / (cost + entryFee),
    holdingDays,
    mfe: Number.isFinite(mfe) ? mfe : null,
    mae: Number.isFinite(mae) ? mae : null,
    maxDrawdown: maxDD,
    capitalEfficiency: holdingDays > 0 ? net / (cost + entryFee) / (holdingDays / 30) : null,
    holdToExpiry: hte,
    path,
  };
}
