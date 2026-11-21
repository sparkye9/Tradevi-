/**
 * Market regime classifier. Rules run top to bottom; the first that matches
 * wins. It is deliberately separate from the 0–100 score: the score says how
 * many risk signals have accumulated, the regime says what stage the market
 * looks to be in, which is what decides whether puts are an early entry or a
 * chase.
 */
import { DEFAULT_REGIME_CONFIG, DEFAULT_RISK_CONFIG, type CategoryId, type RegimeConfig, type RiskConfig } from './config';
import { drawdownFromHigh, vixPercentile } from './indicators';
import type { RiskScoreResult } from './riskScore';
import { PointInTime, pctChange, sma, type CutMode, type MarketDataset } from './series';

export type Regime =
  | 'NORMAL'
  | 'EARLY WARNING'
  | 'ELEVATED RISK'
  | 'PRE-CRASH WATCH'
  | 'BREAKDOWN CONFIRMED'
  | 'VOLATILITY EXPANSION'
  | 'PANIC / LATE ENTRY';

export const REGIME_ORDER: Regime[] = [
  'NORMAL',
  'EARLY WARNING',
  'ELEVATED RISK',
  'PRE-CRASH WATCH',
  'BREAKDOWN CONFIRMED',
  'VOLATILITY EXPANSION',
  'PANIC / LATE ENTRY',
];

export const REGIME_BLURB: Record<Regime, string> = {
  NORMAL: 'No meaningful accumulation of risk signals.',
  'EARLY WARNING': 'Some conditions are deteriorating, but nothing is confirmed.',
  'ELEVATED RISK': 'Several risk signals have accumulated.',
  'PRE-CRASH WATCH': 'Multiple independent indicators are deteriorating while volatility is still subdued — protection may be underpriced.',
  'BREAKDOWN CONFIRMED': 'Price structure confirms downside weakness.',
  'VOLATILITY EXPANSION': 'Implied volatility and option premiums are already rising fast.',
  'PANIC / LATE ENTRY': 'Protection is expensive; the early opportunity has likely passed.',
};

export interface RegimeFacts {
  vix: number | null;
  vixPercentile: number | null;
  vixChange10d: number | null;
  termRatio: number | null;
  spyDrawdown: number | null;
  spyBelow200: boolean | null;
  spyLowerLow: boolean | null;
  deteriorating: CategoryId[];
  subduedVol: boolean | null;
}

export interface RegimeResult {
  regime: Regime;
  /** True when there was too little data to classify; `regime` is then only a placeholder. */
  insufficient: boolean;
  why: string[];
  facts: RegimeFacts;
}

/** Only the category risks are read, so the fast historical path can pass `quickScore` output. */
export type CategoryRisks = { categories: { id: CategoryId; risk: number | null }[] };

export function regimeFacts(data: MarketDataset, asOf: string, mode: CutMode, score: CategoryRisks | RiskScoreResult, cfg: RegimeConfig = DEFAULT_REGIME_CONFIG): RegimeFacts {
  const p = new PointInTime(data, asOf, mode);
  const vixC = p.closes('VIX');
  const vix = vixC.length ? vixC[vixC.length - 1] : null;
  const vix3 = p.latest('VIX3M');
  const vixL = p.latest('VIX');
  const termRatio = vixL && vix3 && vix3.value > 0 && vix3.date === vixL.date ? vixL.value / vix3.value : null;
  const spy = p.closes('SPY');
  const s200 = sma(spy, 200);
  const last = spy.length ? spy[spy.length - 1] : null;
  const lowerLow = spy.length > 51 ? (last as number) < Math.min(...spy.slice(-51, -1)) : null;
  const deteriorating = score.categories
    .filter((c) => c.id !== 'volatility' && c.risk != null && c.risk >= cfg.deterioratingCategoryRisk)
    .map((c) => c.id);
  const vp = vixPercentile(p);
  const subdued = vix == null ? null : vix <= cfg.subduedVix || (vp != null && vp <= cfg.subduedVixPercentile);

  return {
    vix,
    vixPercentile: vp,
    vixChange10d: pctChange(vixC, 10),
    termRatio,
    spyDrawdown: drawdownFromHigh(spy),
    spyBelow200: s200 != null && last != null ? last < s200 : null,
    spyLowerLow: lowerLow,
    deteriorating,
    subduedVol: subdued,
  };
}

export function classifyRegime(
  facts: RegimeFacts,
  score: number | null,
  cfg: RegimeConfig = DEFAULT_REGIME_CONFIG,
  riskCfg: RiskConfig = DEFAULT_RISK_CONFIG,
): RegimeResult {
  const why: string[] = [];
  const f = facts;
  const inverted = f.termRatio != null && f.termRatio >= cfg.inversionRatio;

  if (f.vix != null && (f.vix >= cfg.panicVix || (f.vixPercentile != null && f.vixPercentile >= cfg.panicVixPercentile && inverted))) {
    why.push(`VIX ${f.vix.toFixed(1)}${f.vixPercentile != null ? ` (top ${Math.round((1 - f.vixPercentile) * 100)}% of its past year)` : ''}`);
    if (inverted) why.push(`VIX term structure inverted (${f.termRatio!.toFixed(2)})`);
    return { regime: 'PANIC / LATE ENTRY', insufficient: false, why, facts };
  }
  if (f.vix != null && ((f.vixChange10d != null && f.vixChange10d >= cfg.expansionVixChange10d && f.vix >= cfg.expansionMinVix) || inverted)) {
    if (f.vixChange10d != null) why.push(`VIX ${f.vixChange10d >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(f.vixChange10d * 100))}% in 10 sessions`);
    if (inverted) why.push(`VIX above VIX3M (${f.termRatio!.toFixed(2)})`);
    return { regime: 'VOLATILITY EXPANSION', insufficient: false, why, facts };
  }
  if ((f.spyBelow200 && f.spyLowerLow) || (f.spyDrawdown != null && f.spyDrawdown >= cfg.breakdownDrawdown)) {
    if (f.spyBelow200) why.push('SPY below its 200-day average');
    if (f.spyLowerLow) why.push('SPY closed below its 50-session low');
    if (f.spyDrawdown != null) why.push(`SPY ${Math.round(f.spyDrawdown * 100)}% below its 52-week high`);
    return { regime: 'BREAKDOWN CONFIRMED', insufficient: false, why, facts };
  }
  if (
    f.deteriorating.length >= cfg.preCrashMinCategories &&
    f.subduedVol &&
    (f.spyDrawdown == null || f.spyDrawdown < cfg.preCrashMaxDrawdown)
  ) {
    why.push(`${f.deteriorating.length} independent categories deteriorating (${f.deteriorating.join(', ')})`);
    why.push(`Volatility still subdued (VIX ${f.vix?.toFixed(1) ?? '—'})`);
    if (f.spyDrawdown != null) why.push(`SPY only ${(f.spyDrawdown * 100).toFixed(1)}% off its high`);
    return { regime: 'PRE-CRASH WATCH', insufficient: false, why, facts };
  }
  if (score != null && score >= riskCfg.bands.elevated) {
    why.push(`Risk score ${Math.round(score)} (≥ ${riskCfg.bands.elevated})`);
    return { regime: 'ELEVATED RISK', insufficient: false, why, facts };
  }
  if ((score != null && score >= riskCfg.bands.early) || f.deteriorating.length >= 2) {
    if (score != null) why.push(`Risk score ${Math.round(score)}`);
    if (f.deteriorating.length) why.push(`Deteriorating: ${f.deteriorating.join(', ')}`);
    return { regime: 'EARLY WARNING', insufficient: false, why, facts };
  }
  if (score == null && f.vix == null && f.spyDrawdown == null) {
    return { regime: 'NORMAL', insufficient: true, why: ['Not enough market data to classify the regime'], facts };
  }
  why.push(score != null ? `Risk score ${Math.round(score)}` : 'Risk score unavailable');
  return { regime: 'NORMAL', insufficient: score == null, why, facts };
}
