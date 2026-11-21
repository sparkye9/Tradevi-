/**
 * THEORETICAL historical put reconstruction.
 *
 * Used only when no licensed historical chain is loaded for a date. It is a
 * model built from historical closing prices and Cboe volatility indexes
 * with the assumptions below, all disclosed on screen. It is never shown as
 * an actual historical quote or trade, and every contract it produces has a
 * "THEO:" symbol and source "THEORETICAL".
 *
 * Assumptions (THEORETICAL_MODEL, user-adjustable):
 *  - ATM implied vol = volatility index × atmFactor. VIX is a 30-day
 *    variance-swap rate that includes the put-skew premium, so ATM IV sits a
 *    little below it. SPY/DIA use VIX (and VIX9D / VIX3M for term structure
 *    when published that day), QQQ uses VXN, IWM uses RVX; XLF and KRE use
 *    VIX scaled by their 60-day realized vol relative to SPY's.
 *  - Skew: IV rises `skewPtsPer10Pct` vol points for each 10% the strike is
 *    below spot at 30 days, scaled by √(30/DTE), and by the Cboe SKEW index
 *    relative to 125 when it is available that day.
 *  - Expirations: standard monthly (third-Friday) expirations, and beyond
 *    nine months only quarterly and January ones; weekly options did not
 *    exist for most of this history.
 *  - Strikes: $1 increments ($0.50 below $25).
 *  - Quotes: an assumed spread of max(one tick, spreadPct × value). Ticks
 *    follow the minimum increments of the day: $0.05/$0.10 before the penny
 *    pilot reached these ETFs (assumed 2007-10-01), $0.01/$0.05 after.
 *    Open interest and volume are unknown, so liquidity filters can't be
 *    applied to theoretical contracts.
 *  - Rate: 3-month Treasury yield on that date (FRED DGS3MO); dividends: the
 *    same continuous-yield estimate as the live engine.
 */
import { DIVIDEND_YIELD_ESTIMATE, FALLBACK_RISK_FREE } from '../config';
import type { PutContract } from '../contracts';
import { americanPrice, blackScholes } from '../pricing';
import { PointInTime, addDays, realizedVol, type MarketDataset } from '../series';

export interface TheoreticalModel {
  atmFactor: number;
  skewPtsPer10Pct: number;
  useSkewIndex: boolean;
  spreadPct: number;
  pennyPilotFrom: string;
  treeSteps: number;
}

export const THEORETICAL_MODEL: TheoreticalModel = {
  atmFactor: 0.92,
  skewPtsPer10Pct: 8,
  useSkewIndex: true,
  spreadPct: 0.04,
  pennyPilotFrom: '2007-10-01',
  treeSteps: 100,
};

export const VOL_INDEX: Record<string, string> = { SPY: 'VIX', DIA: 'VIX', QQQ: 'VXN', IWM: 'RVX' };

export const THEORETICAL_LABEL = 'THEORETICAL';

export function thirdFriday(year: number, month0: number): string {
  const d = new Date(Date.UTC(year, month0, 1, 12));
  const offset = (5 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(1 + offset + 14);
  return d.toISOString().slice(0, 10);
}

/** Monthly expirations with DTE in [minDte, maxDte] from `date`. */
export function monthlyExpirations(date: string, minDte: number, maxDte: number): string[] {
  const out: string[] = [];
  const d = new Date(`${date}T12:00:00Z`);
  for (let k = 0; k < 40; k++) {
    const y = d.getUTCFullYear() + Math.floor((d.getUTCMonth() + k) / 12);
    const m = (d.getUTCMonth() + k) % 12;
    const exp = thirdFriday(y, m);
    const dte = dayDiff(date, exp);
    if (dte > maxDte) break;
    // Beyond ~9 months only quarterly and January (LEAPS-style) expirations were listed.
    if (dte > 270 && ![0, 2, 5, 8, 11].includes(m)) continue;
    if (dte >= minDte) out.push(exp);
  }
  return out;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export interface TheoreticalContext {
  symbol: string;
  date: string;
  S: number;
  atm30: number;
  atmSource: string;
  term: { d9: number | null; d30: number; d93: number | null };
  skewScale: number;
  r: number;
  q: number;
  tick: (price: number) => number;
  model: TheoreticalModel;
}

/** Everything needed to price the theoretical chain on one date, from data available that day. */
export function theoreticalContext(data: MarketDataset, symbol: string, date: string, model: TheoreticalModel = THEORETICAL_MODEL): TheoreticalContext | { error: string } {
  const p = new PointInTime(data, date, 'close');
  const closes = p.closes(symbol);
  const bars = p.bars(symbol);
  if (!bars.length || bars[bars.length - 1].date !== date) return { error: `No ${symbol} close on ${date}` };
  const S = closes[closes.length - 1];
  const same = (id: string) => {
    const l = p.latest(id);
    return l && l.date === date ? l.value : null;
  };
  const idx = VOL_INDEX[symbol];
  let atm: number | null = null;
  let src = '';
  if (idx) {
    const v = same(idx);
    if (v != null) {
      atm = (v / 100) * model.atmFactor;
      src = `${idx} × ${model.atmFactor}`;
    }
  } else {
    const vix = same('VIX');
    const rvS = realizedVol(closes, 60);
    const rvM = realizedVol(p.closes('SPY'), 60);
    if (vix != null && rvS != null && rvM != null && rvM > 0) {
      const beta = Math.max(0.8, Math.min(3, rvS / rvM));
      atm = (vix / 100) * model.atmFactor * beta;
      src = `VIX × ${model.atmFactor} × ${beta.toFixed(2)} (60-day realized vol vs SPY)`;
    }
  }
  if (atm == null) return { error: `No volatility index for ${symbol} on ${date}` };
  const spyFamily = idx === 'VIX';
  const v9 = spyFamily ? same('VIX9D') : null;
  const v93 = spyFamily ? same('VIX3M') : null;
  const skew = model.useSkewIndex ? same('SKEW') : null;
  const skewScale = skew != null ? Math.max(0.6, Math.min(1.6, (skew - 100) / 25)) : 1;
  const rate = p.latest('DGS3MO');
  const r = rate && rate.date >= addDays(date, -10) ? rate.value / 100 : FALLBACK_RISK_FREE;
  const penny = date >= model.pennyPilotFrom;
  return {
    symbol,
    date,
    S,
    atm30: atm,
    atmSource: src,
    term: { d9: v9 != null ? (v9 / 100) * model.atmFactor : null, d30: atm, d93: v93 != null ? (v93 / 100) * model.atmFactor : null },
    skewScale,
    r,
    q: DIVIDEND_YIELD_ESTIMATE[symbol] ?? 0,
    tick: (x: number) => (penny ? (x < 3 ? 0.01 : 0.05) : x < 3 ? 0.05 : 0.1),
    model,
  };
}

/** ATM IV at a given DTE, interpolated in total variance across 9 / 30 / 93 days. */
export function atmIvAt(ctx: TheoreticalContext, dte: number): number {
  const pts: [number, number][] = [];
  if (ctx.term.d9 != null) pts.push([9, ctx.term.d9]);
  pts.push([30, ctx.term.d30]);
  if (ctx.term.d93 != null) pts.push([93, ctx.term.d93]);
  if (dte <= pts[0][0]) return pts[0][1];
  if (dte >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    if (dte <= pts[i][0]) {
      const [t0, v0] = pts[i - 1];
      const [t1, v1] = pts[i];
      const w0 = v0 * v0 * t0;
      const w1 = v1 * v1 * t1;
      const w = w0 + ((w1 - w0) * (dte - t0)) / (t1 - t0);
      return Math.sqrt(w / dte);
    }
  }
  return ctx.term.d30;
}

export function theoreticalIv(ctx: TheoreticalContext, K: number, S: number, dte: number): number {
  const atm = atmIvAt(ctx, dte);
  const x = (Math.log(S / K) / 0.1) * Math.sqrt(30 / Math.max(dte, 7));
  const iv = atm + (ctx.model.skewPtsPer10Pct / 100) * ctx.skewScale * x;
  return Math.max(atm * 0.7, iv);
}

function roundTo(x: number, tick: number, dir: 'up' | 'down'): number {
  const n = x / tick;
  return Math.round((dir === 'up' ? Math.ceil(n - 1e-9) : Math.floor(n + 1e-9)) * tick * 100) / 100;
}

/** Assumed bid/ask around a model value. */
export function assumedQuote(ctx: TheoreticalContext, value: number): { bid: number; ask: number } {
  const tick = ctx.tick(value);
  const spread = Math.max(tick, ctx.model.spreadPct * value);
  return { bid: Math.max(0, roundTo(value - spread / 2, tick, 'down')), ask: Math.max(tick, roundTo(value + spread / 2, tick, 'up')) };
}

/** Model value of one put on `ctx.date` (or later, with a different S / dte). */
export function theoreticalValue(ctx: TheoreticalContext, K: number, S: number, dte: number): { value: number; iv: number } {
  const iv = theoreticalIv(ctx, K, S, dte);
  if (dte <= 0) return { value: Math.max(K - S, 0), iv };
  return { value: americanPrice({ type: 'put', S, K, T: dte / 365, r: ctx.r, q: ctx.q, sigma: iv }, ctx.model.treeSteps), iv };
}

export function theoSymbol(symbol: string, exp: string, K: number): string {
  return `THEO:${symbol} ${exp} ${K.toFixed(K % 1 ? 1 : 0)}P`;
}

/**
 * The theoretical put chain for one date. Strikes from 60% to 102% of spot.
 * Greeks from Black-Scholes at the model IV; premiums from the American tree.
 */
export function theoreticalChain(ctx: TheoreticalContext, minDte: number, maxDte: number): PutContract[] {
  const out: PutContract[] = [];
  const inc = ctx.S < 25 ? 0.5 : 1;
  const lo = Math.ceil((ctx.S * 0.6) / inc) * inc;
  const hi = Math.floor((ctx.S * 1.02) / inc) * inc;
  for (const exp of monthlyExpirations(ctx.date, minDte, maxDte)) {
    const dte = dayDiff(ctx.date, exp);
    const T = dte / 365;
    for (let K = lo; K <= hi + 1e-9; K = Math.round((K + inc) * 100) / 100) {
      const iv = theoreticalIv(ctx, K, ctx.S, dte);
      const g = blackScholes({ type: 'put', S: ctx.S, K, T, r: ctx.r, q: ctx.q, sigma: iv });
      // Skip strikes whose model value is below half a tick: nobody would quote them.
      if (g.price < 0.005) continue;
      const value = americanPrice({ type: 'put', S: ctx.S, K, T, r: ctx.r, q: ctx.q, sigma: iv }, ctx.model.treeSteps);
      const q = assumedQuote(ctx, value);
      out.push({
        symbol: theoSymbol(ctx.symbol, exp, K),
        underlying: ctx.symbol,
        type: 'put',
        strike: K,
        expiration: exp,
        dte,
        bid: q.bid,
        ask: q.ask,
        last: null,
        volume: null,
        openInterest: null,
        delta: g.delta,
        gamma: g.gamma,
        theta: g.theta,
        vega: g.vega,
        iv,
        greeksUpdatedAt: null,
        source: THEORETICAL_LABEL,
      });
    }
  }
  return out;
}

/** Smile at one expiration from the model, for the scenario grid's skew handling. */
export function theoreticalSmile(ctx: TheoreticalContext, dte: number): { m: number; iv: number }[] {
  const out: { m: number; iv: number }[] = [];
  for (let m = 0.6; m <= 1.05 + 1e-9; m += 0.025) out.push({ m, iv: theoreticalIv(ctx, ctx.S * m, ctx.S, dte) });
  return out;
}
