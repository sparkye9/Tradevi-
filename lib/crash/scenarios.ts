/**
 * Scenario analysis for one option: value under combined price and implied-
 * volatility shocks, today, at a chosen hold date and at expiration.
 *
 * All values are model estimates from the American binomial tree in
 * pricing.ts, never executable prices. Before expiration the option keeps
 * time value, so the "today" and "hold" grids differ from the expiration
 * payoff, which is shown separately.
 *
 * Skew: when a smile (strike/spot → IV) from the live chain is supplied,
 * shocks are applied sticky-moneyness and proportionally (an ATM +10 point
 * move lifts a put whose IV is 1.5× ATM by 15 points), so OTM puts do not
 * all reprice identically. Without a smile the shock is a flat add.
 */
import { americanPrice, impliedVolAmerican, type OptionType } from './pricing';

export interface SmilePoint {
  /** strike / spot */
  m: number;
  iv: number;
}

export interface ScenarioInput {
  type: OptionType;
  S: number;
  K: number;
  dte: number;
  /** Price paid per share (ask or a limit). */
  entry: number;
  /** Current mid per share, used to back out the model's IV. */
  mid: number | null;
  /** Vendor IV (decimal), used when the mid cannot be inverted. */
  iv: number;
  r: number;
  q: number;
  smile?: SmilePoint[];
  /** Calendar days held for the "hold" horizon (clamped below DTE). */
  holdDays?: number;
  steps?: number;
}

export interface ScenarioCell {
  priceShock: number;
  ivShock: number;
  underlying: number;
  /** IV used for this cell, decimal (null at expiration). */
  ivUsed: number | null;
  value: number;
  pnl: number;
  pnlPct: number;
}

export interface ScenarioResult {
  baseIv: number;
  ivSource: 'mid-implied' | 'vendor';
  skewModel: 'sticky-moneyness' | 'flat';
  entryPerContract: number;
  maxLoss: number;
  breakeven: number;
  holdDays: number;
  daysRemainingAtHold: number;
  now: ScenarioCell[];
  hold: ScenarioCell[];
  expiry: ScenarioCell[];
}

function interpSmile(smile: SmilePoint[], m: number): number | null {
  if (smile.length < 2) return null;
  const s = [...smile].sort((a, b) => a.m - b.m);
  if (m <= s[0].m) return s[0].iv;
  if (m >= s[s.length - 1].m) return s[s.length - 1].iv;
  for (let i = 1; i < s.length; i++) {
    if (m <= s[i].m) {
      const t = (m - s[i - 1].m) / (s[i].m - s[i - 1].m);
      return s[i - 1].iv + t * (s[i].iv - s[i - 1].iv);
    }
  }
  return null;
}

export function shockedIv(input: { K: number; S: number; baseIv: number; smile?: SmilePoint[] }, newS: number, ivShockPts: number): { iv: number; model: 'sticky-moneyness' | 'flat' } {
  const smile = input.smile && input.smile.length >= 3 ? input.smile : null;
  const atm = smile ? interpSmile(smile, 1) : null;
  const here = smile ? interpSmile(smile, input.K / input.S) : null;
  if (smile && atm && here && atm > 0 && here > 0) {
    const scale = input.baseIv / here; // anchor the smile to this contract's own IV
    const after = (interpSmile(smile, input.K / newS) ?? here) * scale;
    const iv = after * (1 + ivShockPts / 100 / atm);
    return { iv: Math.max(0.01, iv), model: 'sticky-moneyness' };
  }
  return { iv: Math.max(0.01, input.baseIv + ivShockPts / 100), model: 'flat' };
}

export function runScenarios(inp: ScenarioInput, priceShocks: number[], ivShocks: number[]): ScenarioResult {
  const steps = inp.steps ?? 150;
  const T = inp.dte / 365;
  const base = { type: inp.type, S: inp.S, K: inp.K, T, r: inp.r, q: inp.q };
  const implied = inp.mid != null && inp.mid > 0 && T > 0 ? impliedVolAmerican(base, inp.mid, steps) : null;
  const baseIv = implied ?? inp.iv;
  const holdDays = Math.max(0, Math.min(inp.holdDays ?? Math.round(inp.dte / 2), Math.max(0, inp.dte - 1)));
  const entryC = inp.entry * 100;
  const sign = inp.type === 'put' ? -1 : 1;
  let skewModel: 'sticky-moneyness' | 'flat' = 'flat';

  const grid = (days: number): ScenarioCell[] => {
    const out: ScenarioCell[] = [];
    const Th = Math.max(0, (inp.dte - days) / 365);
    for (const ps of priceShocks) {
      const S2 = inp.S * (1 + ps);
      for (const vs of ivShocks) {
        const sh = shockedIv({ K: inp.K, S: inp.S, baseIv, smile: inp.smile }, S2, vs);
        skewModel = sh.model;
        const v = americanPrice({ ...base, S: S2, T: Th, sigma: sh.iv }, steps);
        out.push({ priceShock: ps, ivShock: vs, underlying: S2, ivUsed: sh.iv, value: v, pnl: v * 100 - entryC, pnlPct: entryC > 0 ? (v * 100 - entryC) / entryC : 0 });
      }
    }
    return out;
  };

  const now = grid(0);
  const hold = grid(holdDays);
  const expiry: ScenarioCell[] = priceShocks.map((ps) => {
    const S2 = inp.S * (1 + ps);
    const v = inp.type === 'put' ? Math.max(inp.K - S2, 0) : Math.max(S2 - inp.K, 0);
    return { priceShock: ps, ivShock: 0, underlying: S2, ivUsed: null, value: v, pnl: v * 100 - entryC, pnlPct: entryC > 0 ? (v * 100 - entryC) / entryC : 0 };
  });

  return {
    baseIv,
    ivSource: implied != null ? 'mid-implied' : 'vendor',
    skewModel,
    entryPerContract: entryC,
    maxLoss: entryC,
    breakeven: inp.K + sign * inp.entry,
    holdDays,
    daysRemainingAtHold: inp.dte - holdDays,
    now,
    hold,
    expiry,
  };
}

/** Build a smile from a chain's puts at one expiration (OTM puts and near-ATM only). */
export function smileFromChain(rows: { strike: number; iv: number | null; type: OptionType }[], S: number): SmilePoint[] {
  return rows
    .filter((r) => r.type === 'put' && r.iv != null && r.iv > 0 && r.strike <= S * 1.05)
    .map((r) => ({ m: r.strike / S, iv: r.iv as number }));
}
