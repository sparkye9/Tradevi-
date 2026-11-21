/**
 * Put Hunter contract evaluation: screening, derived numbers, the 0–100
 * Contract Quality score and rejection reasons.
 *
 * Quality is about the contract itself (cost of waiting, liquidity, how
 * much the premium buys in downside and volatility sensitivity, how far the
 * underlying must fall). It never looks at whether the market is risky —
 * that is the Market Risk score — and is never a probability of profit.
 */
import type { ScreenFilters } from './config';

export interface PutContract {
  /** OCC option symbol. */
  symbol: string;
  underlying: string;
  type: 'put' | 'call';
  strike: number;
  expiration: string;
  dte: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number | null;
  openInterest: number | null;
  delta: number | null;
  gamma: number | null;
  /** Per share per day (Tradier convention). */
  theta: number | null;
  /** Per share per 1 vol point. */
  vega: number | null;
  /** Decimal (0.18 = 18%). */
  iv: number | null;
  /** ISO time the Greeks were computed. */
  greeksUpdatedAt: string | null;
  source: string;
}

export interface MarketContext {
  underlyingPrice: number;
  /** SPY-style 20-day realized vol of this underlying, decimal. */
  realizedVol20: number | null;
  /** IV of the put nearest the money at this expiration, decimal. */
  atmIv: number | null;
  /** True when the regular session is open (stale-Greeks check only applies then). */
  sessionOpen: boolean;
  now: Date;
}

export type Moneyness = 'Deep OTM' | 'Moderately OTM' | 'Near ATM' | 'ITM';

export interface QualityComponent {
  id: string;
  label: string;
  weight: number;
  /** 0–1, null = not computable (left out and the rest re-weighted). */
  score: number | null;
  detail: string;
}

export interface EvaluatedContract {
  contract: PutContract;
  mid: number | null;
  spreadPct: number | null;
  /** Dollars per contract at the ask (what a market order would pay), before fees. */
  costAtAsk: number | null;
  costAtMid: number | null;
  /** Expiration breakeven assuming purchase at the ask. */
  breakevenAtAsk: number | null;
  breakevenAtMid: number | null;
  /** Decline from today's price needed to reach breakeven at expiry (decimal), at ask. */
  declineToBreakeven: number | null;
  /** That decline divided by a one-standard-deviation move to expiry at the contract's IV. */
  sigmasToBreakeven: number | null;
  moneyness: Moneyness | null;
  /** Theta in dollars per contract per day (negative = decay). */
  thetaDollarsPerDay: number | null;
  /** |theta| / mid per day. */
  thetaPctPerDay: number | null;
  /** Dollar gain per contract for +5 and +10 vol points, from vega alone. */
  vegaGain5: number | null;
  vegaGain10: number | null;
  /** vega / mid: % change in premium per vol point. */
  vegaPerPremium: number | null;
  ivVsRealized: number | null;
  /** Put IV minus ATM IV at the same expiration, vol points. */
  skewPts: number | null;
  passes: boolean;
  rejections: string[];
  flags: string[];
  quality: number | null;
  components: QualityComponent[];
}

function finite(x: number | null | undefined): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

export function moneynessOf(absDelta: number | null, strike: number, S: number, type: 'put' | 'call' = 'put'): Moneyness | null {
  const itm = type === 'put' ? strike > S : strike < S;
  if (itm && (absDelta == null || absDelta > 0.5)) return 'ITM';
  if (absDelta == null) return null;
  if (absDelta < 0.15) return 'Deep OTM';
  if (absDelta < 0.35) return 'Moderately OTM';
  if (absDelta <= 0.65) return 'Near ATM';
  return 'ITM';
}

/** Interpolate 0–1 between two anchors (either direction), clamped. */
function lin(x: number, at0: number, at1: number): number {
  const t = (x - at0) / (at1 - at0);
  return Math.max(0, Math.min(1, t));
}

export function evaluateContract(c: PutContract, ctx: MarketContext, f: ScreenFilters): EvaluatedContract {
  const S = ctx.underlyingPrice;
  const rejections: string[] = [];
  const flags: string[] = [];
  const bid = finite(c.bid) ? c.bid : null;
  const ask = finite(c.ask) ? c.ask : null;
  const mid = bid != null && ask != null && ask > 0 && ask >= bid ? (bid + ask) / 2 : null;
  const spreadPct = mid != null && mid > 0 && bid != null && ask != null ? (ask - bid) / mid : null;
  const absDelta = finite(c.delta) ? Math.abs(c.delta) : null;

  // ── Hard data checks ──
  if (ask == null || bid == null) rejections.push('No two-sided quote');
  else if (bid <= 0) rejections.push('Zero bid: no buyer to sell back to');
  if (ask != null && bid != null && ask < bid) rejections.push('Crossed quote (ask below bid)');
  if (!finite(c.delta) || !finite(c.gamma) || !finite(c.theta) || !finite(c.vega) || !finite(c.iv) || (c.iv ?? 0) <= 0) rejections.push('Incomplete Greeks or IV');
  if (c.greeksUpdatedAt && ctx.sessionOpen) {
    const ageMin = (ctx.now.getTime() - Date.parse(c.greeksUpdatedAt)) / 60000;
    if (Number.isFinite(ageMin) && ageMin > f.maxGreeksAgeMin) rejections.push(`Stale Greeks (${Math.round(ageMin)} min old)`);
  }
  if (!(S > 0)) rejections.push('No underlying price');

  // ── Screening filters ──
  if (mid != null && (mid < f.minPremium || mid > f.maxPremium)) rejections.push(`Premium $${mid.toFixed(2)} outside $${f.minPremium.toFixed(2)}–$${f.maxPremium.toFixed(2)}`);
  if (c.dte < f.minDte || c.dte > f.maxDte) rejections.push(`${c.dte} DTE outside ${f.minDte}–${f.maxDte}`);
  if (absDelta != null && (absDelta < f.minAbsDelta || absDelta > f.maxAbsDelta)) rejections.push(`|Delta| ${absDelta.toFixed(2)} outside ${f.minAbsDelta.toFixed(2)}–${f.maxAbsDelta.toFixed(2)}`);
  if ((c.openInterest ?? 0) < f.minOpenInterest) rejections.push(`Open interest ${c.openInterest ?? 0} < ${f.minOpenInterest}`);
  if ((c.volume ?? 0) < f.minVolume) rejections.push(`Volume ${c.volume ?? 0} < ${f.minVolume}`);
  if (spreadPct != null && spreadPct > f.maxSpreadPct) rejections.push(`Spread ${(spreadPct * 100).toFixed(0)}% > ${(f.maxSpreadPct * 100).toFixed(0)}%`);

  // ── Derived numbers ──
  const costAtAsk = ask != null ? ask * 100 : null;
  const costAtMid = mid != null ? mid * 100 : null;
  const sign = c.type === 'put' ? -1 : 1;
  const breakevenAtAsk = ask != null ? c.strike + sign * ask : null;
  const breakevenAtMid = mid != null ? c.strike + sign * mid : null;
  const declineToBreakeven = breakevenAtAsk != null && S > 0 ? (c.type === 'put' ? 1 - breakevenAtAsk / S : breakevenAtAsk / S - 1) : null;
  const sd = finite(c.iv) && c.iv > 0 && c.dte > 0 ? c.iv * Math.sqrt(c.dte / 365) : null;
  const sigmasToBreakeven = declineToBreakeven != null && sd ? Math.max(0, declineToBreakeven) / sd : null;
  const thetaDollarsPerDay = finite(c.theta) ? c.theta * 100 : null;
  const thetaPctPerDay = finite(c.theta) && mid ? Math.abs(c.theta) / mid : null;
  const vegaGain5 = finite(c.vega) ? c.vega * 5 * 100 : null;
  const vegaGain10 = finite(c.vega) ? c.vega * 10 * 100 : null;
  const vegaPerPremium = finite(c.vega) && mid ? c.vega / mid : null;
  const ivVsRealized = finite(c.iv) && ctx.realizedVol20 && ctx.realizedVol20 > 0 ? c.iv / ctx.realizedVol20 : null;
  const skewPts = finite(c.iv) && ctx.atmIv ? (c.iv - ctx.atmIv) * 100 : null;

  if (thetaPctPerDay != null && thetaPctPerDay > 0.05) flags.push(`Time decay is steep: ${(thetaPctPerDay * 100).toFixed(1)}% of the premium per day`);
  if (c.dte < 21 && finite(c.gamma)) flags.push('Under 21 DTE: gamma is high but so is expiration risk');
  if (mid != null && mid <= 0.05) flags.push('Very cheap: the market prices reaching this strike as unlikely');
  if (skewPts != null && skewPts > 12) flags.push(`Rich skew: ${skewPts.toFixed(0)} vol points over at-the-money`);

  // ── Quality components ──
  const comps: QualityComponent[] = [
    {
      id: 'liquidity',
      label: 'Liquidity & spread',
      weight: 20,
      score:
        spreadPct == null
          ? null
          : 0.5 * lin(spreadPct, 0.25, 0.05) +
            0.25 * lin(Math.log10(Math.max(1, c.openInterest ?? 1)), 2, 3.7) +
            0.25 * lin(Math.log10(Math.max(1, c.volume ?? 1)), 1, 3),
      detail: spreadPct == null ? 'No two-sided quote' : `Spread ${(spreadPct * 100).toFixed(0)}%, OI ${c.openInterest ?? 0}, volume ${c.volume ?? 0}`,
    },
    {
      id: 'theta',
      label: 'Cost of waiting (theta)',
      weight: 20,
      score: thetaPctPerDay == null ? null : lin(thetaPctPerDay, 0.06, 0.015),
      detail: thetaPctPerDay == null ? 'No theta' : `${(thetaPctPerDay * 100).toFixed(1)}% of premium per day`,
    },
    {
      id: 'vega',
      label: 'Volatility upside (vega per $)',
      weight: 15,
      score: vegaPerPremium == null ? null : lin(vegaPerPremium, 0.03, 0.15),
      detail: vegaPerPremium == null ? 'No vega' : `+1 vol point ≈ +${(vegaPerPremium * 100).toFixed(0)}% of premium`,
    },
    {
      id: 'breakeven',
      label: 'Distance to breakeven',
      weight: 20,
      score: sigmasToBreakeven == null ? null : lin(sigmasToBreakeven, 3, 1),
      detail: sigmasToBreakeven == null ? 'Needs IV' : `${((declineToBreakeven ?? 0) * 100).toFixed(1)}% fall = ${sigmasToBreakeven.toFixed(1)} standard moves`,
    },
    {
      id: 'time',
      label: 'Time for the thesis (DTE / gamma)',
      weight: 10,
      score: c.dte >= 30 && c.dte <= 90 ? 1 : c.dte < 30 ? lin(c.dte, 10, 30) : lin(c.dte, 180, 90) * 0.5 + 0.5,
      detail: `${c.dte} days; gamma ${finite(c.gamma) ? c.gamma.toFixed(4) : '—'}`,
    },
    {
      id: 'iv_value',
      label: 'Price of volatility (IV vs realized, skew)',
      weight: 15,
      score:
        ivVsRealized == null
          ? null
          : 0.7 * lin(ivVsRealized, 2.0, 1.1) + 0.3 * (skewPts == null ? lin(ivVsRealized, 2.0, 1.1) : lin(skewPts, 15, 3)),
      detail: ivVsRealized == null ? 'Needs realized volatility' : `IV ${((c.iv ?? 0) * 100).toFixed(1)}% vs realized ${((ctx.realizedVol20 ?? 0) * 100).toFixed(1)}%${skewPts != null ? `, skew +${skewPts.toFixed(1)} pts` : ''}`,
    },
  ];
  const avail = comps.filter((x) => x.score != null);
  const wsum = avail.reduce((s, x) => s + x.weight, 0);
  const quality = rejections.some((r) => r.startsWith('Incomplete') || r.startsWith('No two-sided')) || !wsum
    ? null
    : Math.round((100 * avail.reduce((s, x) => s + x.weight * (x.score as number), 0)) / wsum);

  return {
    contract: c,
    mid,
    spreadPct,
    costAtAsk,
    costAtMid,
    breakevenAtAsk,
    breakevenAtMid,
    declineToBreakeven,
    sigmasToBreakeven,
    moneyness: moneynessOf(absDelta, c.strike, S, c.type),
    thetaDollarsPerDay,
    thetaPctPerDay,
    vegaGain5,
    vegaGain10,
    vegaPerPremium,
    ivVsRealized,
    skewPts,
    passes: rejections.length === 0,
    rejections,
    flags,
    quality,
    components: comps,
  };
}

/** IV of the put whose strike is closest to the underlying, per expiration. */
export function atmIvByExpiration(contracts: PutContract[], S: number): Map<string, number> {
  const best = new Map<string, { d: number; iv: number }>();
  for (const c of contracts) {
    if (c.type !== 'put' || !finite(c.iv) || c.iv <= 0) continue;
    const d = Math.abs(c.strike - S);
    const cur = best.get(c.expiration);
    if (!cur || d < cur.d) best.set(c.expiration, { d, iv: c.iv });
  }
  return new Map(Array.from(best).map(([k, v]) => [k, v.iv]));
}
