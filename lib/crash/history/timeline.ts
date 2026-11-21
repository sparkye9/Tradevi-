/**
 * Historical score and regime for every session, reconstructed with the
 * same engine as the live dashboard. Each date sees only data available on
 * that date (PointInTime guard), so the timeline is free of look-ahead by
 * construction; `scripts/check-crash-history.ts` verifies this by scoring
 * on truncated data.
 */
import { DEFAULT_REGIME_CONFIG, DEFAULT_RISK_CONFIG, type CategoryId, type RegimeConfig, type RiskConfig } from '../config';
import { classifyRegime, regimeFacts, type Regime } from '../regime';
import { quickScore } from '../riskScore';
import type { CutMode, MarketDataset } from '../series';
import { CATEGORY_ORDER } from '../config';

export interface TimelinePoint {
  date: string;
  score: number | null;
  categories: Record<CategoryId, number | null>;
  regime: Regime;
  insufficient: boolean;
  spy: number | null;
  vix: number | null;
}

export interface TimelineOptions {
  from?: string;
  to?: string;
  mode?: CutMode;
  riskConfig?: RiskConfig;
  regimeConfig?: RegimeConfig;
  /** Score every n-th session (1 = daily). */
  step?: number;
}

/** Trading sessions in the dataset (SPY dates). */
export function sessions(data: MarketDataset): string[] {
  const spy = data.series.SPY;
  return spy && spy.kind === 'bars' ? spy.bars.map((b) => b.date) : [];
}

export function scoreDate(data: MarketDataset, date: string, mode: CutMode = 'close', riskCfg = DEFAULT_RISK_CONFIG, regimeCfg = DEFAULT_REGIME_CONFIG): TimelinePoint {
  const q = quickScore(data, date, mode, riskCfg);
  const cats = CATEGORY_ORDER.map((id) => ({ id, risk: q.categories[id] ?? null }));
  const facts = regimeFacts(data, date, mode, { categories: cats }, regimeCfg);
  const reg = classifyRegime(facts, q.score, regimeCfg, riskCfg);
  const spy = data.series.SPY;
  let spyClose: number | null = null;
  if (spy && spy.kind === 'bars') {
    const b = spy.bars.find((x) => x.date === date);
    spyClose = b && mode === 'close' ? b.close : null;
  }
  return {
    date,
    score: q.score == null ? null : Math.round(q.score * 10) / 10,
    categories: q.categories,
    regime: reg.regime,
    insufficient: reg.insufficient,
    spy: spyClose,
    vix: facts.vix,
  };
}

export function buildTimeline(data: MarketDataset, opts: TimelineOptions = {}): TimelinePoint[] {
  const step = Math.max(1, Math.floor(opts.step ?? 1));
  const all = sessions(data).filter((d) => (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to));
  const out: TimelinePoint[] = [];
  for (let i = 0; i < all.length; i += step) {
    out.push(scoreDate(data, all[i], opts.mode ?? 'close', opts.riskConfig ?? DEFAULT_RISK_CONFIG, opts.regimeConfig ?? DEFAULT_REGIME_CONFIG));
  }
  if (step > 1 && all.length && out[out.length - 1].date !== all[all.length - 1]) {
    out.push(scoreDate(data, all[all.length - 1], opts.mode ?? 'close', opts.riskConfig ?? DEFAULT_RISK_CONFIG, opts.regimeConfig ?? DEFAULT_REGIME_CONFIG));
  }
  return out;
}

/** First date each regime appeared within [from, to]. */
export function firstAppearances(tl: readonly TimelinePoint[], from: string, to: string): Partial<Record<Regime, string>> {
  const out: Partial<Record<Regime, string>> = {};
  for (const p of tl) {
    if (p.date < from || p.date > to || p.insufficient) continue;
    if (!out[p.regime]) out[p.regime] = p.date;
  }
  return out;
}
