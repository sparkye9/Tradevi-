/**
 * Market Crash Risk Score (0–100).
 *
 *   indicator risk (0–1) → cluster risk = mean of its available indicators
 *   → category risk = mean of its available clusters
 *   → score = 100 × Σ(weight × category risk) / Σ(weight of scored categories)
 *
 * Missing data is never scored as zero risk: a missing indicator is left out,
 * a category with too few clusters is "insufficient data" and left out, and
 * the result reports coverage so a 60 on half the data reads differently
 * from a 60 on all of it. The score counts accumulated risk signals; it is
 * not a probability of a crash.
 */
import { CATEGORY_LABEL, CATEGORY_ORDER, DEFAULT_RISK_CONFIG, type CategoryId, type RiskConfig } from './config';
import { INDICATORS, type IndicatorDef } from './indicators';
import { PointInTime, type MarketDataset, type CutMode } from './series';

export type Direction = 'deteriorating' | 'improving' | 'flat';

export interface IndicatorReading {
  id: string;
  category: CategoryId;
  cluster: string;
  label: string;
  about: string;
  status: 'ok' | 'missing';
  value: number | null;
  display: string;
  risk: number | null;
  interpretation: string;
  /** Change in risk reading versus 5 and 20 sessions earlier. */
  direction5: Direction | null;
  direction20: Direction | null;
  source: string | null;
  /** Observation date of the newest input. */
  asOf: string | null;
  /** Why the indicator could not be computed. */
  missingReason?: string;
  /** Input is revisable and no first-release vintage was available. */
  revisable: boolean;
}

export interface CategoryResult {
  id: CategoryId;
  label: string;
  weight: number;
  /** 0–1, null when insufficient data. */
  risk: number | null;
  /** Points contributed to the 0–100 score. */
  points: number | null;
  clustersTotal: number;
  clustersAvailable: number;
  coverage: number;
  insufficient: boolean;
  direction5: Direction | null;
}

export type ScoreBand = 'Normal' | 'Early warnings' | 'Elevated downside risk' | 'High downside risk' | 'Severe market stress';

export interface RiskScoreResult {
  asOf: string;
  mode: CutMode;
  score: number | null;
  band: ScoreBand | null;
  /** Weighted share of clusters that had data, 0–1. */
  coverage: number;
  confidence: 'high' | 'medium' | 'low';
  categories: CategoryResult[];
  indicators: IndicatorReading[];
}

const DIR_EPS = 0.05;

function dir(now: number | null, then: number | null): Direction | null {
  if (now == null || then == null) return null;
  if (now - then > DIR_EPS) return 'deteriorating';
  if (then - now > DIR_EPS) return 'improving';
  return 'flat';
}

export function bandFor(score: number, cfg: RiskConfig = DEFAULT_RISK_CONFIG): ScoreBand {
  if (score >= cfg.bands.severe) return 'Severe market stress';
  if (score >= cfg.bands.high) return 'High downside risk';
  if (score >= cfg.bands.elevated) return 'Elevated downside risk';
  if (score >= cfg.bands.early) return 'Early warnings';
  return 'Normal';
}

function evalIndicator(def: IndicatorDef, p: PointInTime) {
  const missing = def.needs.filter((id) => !p.has(id));
  if (missing.length && missing.length === def.needs.length) return { v: null, reason: `No data for ${missing.join(', ')}` };
  try {
    const v = def.compute(p);
    return { v, reason: v ? undefined : missing.length ? `No data for ${missing.join(', ')}` : 'Not enough history yet' };
  } catch (e) {
    return { v: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Trading dates of SPY (or VIX) up to the cut, used to step back 5 / 20 sessions. */
function sessionDates(p: PointInTime): string[] {
  const b = p.bars('SPY');
  if (b.length) return b.map((x) => x.date);
  return p.levels('VIX').map((x) => x.date);
}

interface RawScore {
  score: number | null;
  categories: Map<CategoryId, { risk: number | null; clustersTotal: number; clustersAvailable: number }>;
  readings: Map<string, { v: ReturnType<IndicatorDef['compute']>; reason?: string }>;
}

function rawScore(p: PointInTime, cfg: RiskConfig, defs: IndicatorDef[]): RawScore {
  const readings = new Map<string, { v: ReturnType<IndicatorDef['compute']>; reason?: string }>();
  for (const d of defs) readings.set(d.id, evalIndicator(d, p));
  const categories = new Map<CategoryId, { risk: number | null; clustersTotal: number; clustersAvailable: number }>();
  let num = 0;
  let den = 0;
  for (const cat of CATEGORY_ORDER) {
    const clusters = new Map<string, number[]>();
    for (const d of defs) {
      if (d.category !== cat) continue;
      if (!clusters.has(d.cluster)) clusters.set(d.cluster, []);
      const r = readings.get(d.id)?.v;
      if (r) clusters.get(d.cluster)!.push(r.risk);
    }
    const avail = Array.from(clusters.values()).filter((v) => v.length > 0);
    const total = clusters.size;
    const coverage = total ? avail.length / total : 0;
    let risk: number | null = null;
    if (total && coverage >= cfg.minCategoryCoverage) {
      risk = avail.reduce((s, v) => s + v.reduce((a, b) => a + b, 0) / v.length, 0) / avail.length;
      num += cfg.weights[cat] * risk;
      den += cfg.weights[cat];
    }
    categories.set(cat, { risk, clustersTotal: total, clustersAvailable: avail.length });
  }
  return { score: den > 0 ? (100 * num) / den : null, categories, readings };
}

/**
 * Score one as-of date. `asOf` defaults to the latest SPY session in the data.
 */
export function computeRiskScore(
  data: MarketDataset,
  opts: { asOf?: string; mode?: CutMode; config?: RiskConfig; indicators?: IndicatorDef[] } = {},
): RiskScoreResult {
  const cfg = opts.config ?? DEFAULT_RISK_CONFIG;
  const defs = opts.indicators ?? INDICATORS;
  const mode = opts.mode ?? 'close';
  const asOf = opts.asOf ?? latestSession(data) ?? new Date().toISOString().slice(0, 10);
  const p = new PointInTime(data, asOf, mode);
  const dates = sessionDates(p);
  const back = (n: number) => (dates.length > n ? dates[dates.length - 1 - n] : null);
  const d5 = back(5);
  const d20 = back(20);
  const now = rawScore(p, cfg, defs);
  const prev5 = d5 ? rawScore(new PointInTime(data, d5, 'close'), cfg, defs) : null;
  const prev20 = d20 ? rawScore(new PointInTime(data, d20, 'close'), cfg, defs) : null;

  const indicators: IndicatorReading[] = defs.map((d) => {
    const r = now.readings.get(d.id)!;
    const v = r.v;
    const metas = d.needs.map((id) => p.meta(id)).filter(Boolean);
    const newest = d.needs
      .map((id) => p.latest(id)?.date ?? null)
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null;
    return {
      id: d.id,
      category: d.category,
      cluster: d.cluster,
      label: d.label,
      about: d.about,
      status: v ? 'ok' : 'missing',
      value: v?.value ?? null,
      display: v?.display ?? '—',
      risk: v?.risk ?? null,
      interpretation: v?.interpretation ?? (r.reason ?? 'Unavailable'),
      direction5: dir(v?.risk ?? null, prev5?.readings.get(d.id)?.v?.risk ?? null),
      direction20: dir(v?.risk ?? null, prev20?.readings.get(d.id)?.v?.risk ?? null),
      source: metas.length ? Array.from(new Set(metas.map((m) => m!.source))).join(' · ') : null,
      asOf: v ? newest : null,
      missingReason: v ? undefined : r.reason,
      revisable: metas.some((m) => m!.revisable && !m!.vintage),
    };
  });

  let covNum = 0;
  let covDen = 0;
  const categories: CategoryResult[] = CATEGORY_ORDER.map((id) => {
    const c = now.categories.get(id)!;
    const w = cfg.weights[id];
    covNum += w * (c.clustersTotal ? c.clustersAvailable / c.clustersTotal : 0);
    covDen += w;
    const sumW = CATEGORY_ORDER.reduce((s, k) => s + (now.categories.get(k)!.risk != null ? cfg.weights[k] : 0), 0);
    return {
      id,
      label: CATEGORY_LABEL[id],
      weight: w,
      risk: c.risk,
      points: c.risk != null && sumW > 0 ? (100 * w * c.risk) / sumW : null,
      clustersTotal: c.clustersTotal,
      clustersAvailable: c.clustersAvailable,
      coverage: c.clustersTotal ? c.clustersAvailable / c.clustersTotal : 0,
      insufficient: c.risk == null,
      direction5: dir(c.risk, prev5?.categories.get(id)?.risk ?? null),
    };
  });
  const coverage = covDen ? covNum / covDen : 0;
  const score = now.score == null ? null : Math.round(now.score * 10) / 10;
  return {
    asOf,
    mode,
    score,
    band: score == null ? null : bandFor(score, cfg),
    coverage,
    confidence: coverage >= 0.8 ? 'high' : coverage >= 0.55 ? 'medium' : 'low',
    categories,
    indicators,
  };
}

/** Score only (no readings or directions) — fast path for historical series. */
export function quickScore(data: MarketDataset, asOf: string, mode: CutMode = 'close', cfg: RiskConfig = DEFAULT_RISK_CONFIG) {
  const r = rawScore(new PointInTime(data, asOf, mode), cfg, INDICATORS);
  const cats: Partial<Record<CategoryId, number | null>> = {};
  r.categories.forEach((v, k) => { cats[k] = v.risk; });
  return { score: r.score, categories: cats as Record<CategoryId, number | null> };
}

export function latestSession(data: MarketDataset): string | null {
  const spy = data.series.SPY;
  if (spy && spy.kind === 'bars' && spy.bars.length) return spy.bars[spy.bars.length - 1].date;
  const vix = data.series.VIX;
  if (vix && vix.kind === 'level' && vix.points.length) return vix.points[vix.points.length - 1].date;
  return null;
}
