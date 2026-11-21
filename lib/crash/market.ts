/**
 * Server-side assembly of the Crash Intelligence view: score, regime,
 * catalysts, recent score history and data-source status. Shared by the
 * dashboard API and the Put Hunter API.
 */
import { fetchEconomicCalendar } from '../economicCalendar';
import { equitySession } from '../marketData/session';
import { DEFAULT_REGIME_CONFIG, DEFAULT_RISK_CONFIG, type CategoryId } from './config';
import { fomcCatalysts, weeklyCatalysts, type Catalyst } from './catalysts';
import { classifyRegime, regimeFacts, type RegimeResult } from './regime';
import { computeRiskScore, latestSession, quickScore, type RiskScoreResult } from './riskScore';
import { addDays, type MarketDataset } from './series';

export interface SeriesStatus {
  id: string;
  label: string;
  source: string;
  lastDate: string | null;
  freshness: string;
  revisable: boolean;
  vintage: boolean;
  license?: string;
}

export interface MarketView {
  generatedAt: string;
  session: string;
  score: RiskScoreResult;
  regime: RegimeResult;
  history: { date: string; score: number | null; categories: Record<CategoryId, number | null> }[];
  catalysts: Catalyst[];
  catalystError?: string;
  series: SeriesStatus[];
  errors: { id: string; error: string }[];
  keyLevels: { symbol: string; last: number | null; sma50: number | null; sma200: number | null; high52: number | null; low50: number | null }[];
}

export function seriesStatus(data: MarketDataset): SeriesStatus[] {
  return Object.values(data.series).map((s) => {
    const last = s.kind === 'bars' ? s.bars[s.bars.length - 1]?.date ?? null : s.points[s.points.length - 1]?.date ?? null;
    return { id: s.meta.id, label: s.meta.label, source: s.meta.source, lastDate: last, freshness: s.meta.freshness, revisable: !!s.meta.revisable, vintage: !!s.meta.vintage, license: s.meta.license };
  });
}

function keyLevels(data: MarketDataset, sym: string) {
  const s = data.series[sym];
  if (!s || s.kind !== 'bars' || !s.bars.length) return { symbol: sym, last: null, sma50: null, sma200: null, high52: null, low50: null };
  const c = s.bars.map((b) => b.close);
  const avg = (n: number) => (c.length >= n ? c.slice(-n).reduce((a, b) => a + b, 0) / n : null);
  return {
    symbol: sym,
    last: c[c.length - 1],
    sma50: avg(50),
    sma200: avg(200),
    high52: Math.max(...c.slice(-252)),
    low50: Math.min(...c.slice(-50)),
  };
}

/** Score history over the last `sessions` SPY sessions (fast path). */
export function scoreHistory(data: MarketDataset, sessions: number) {
  const spy = data.series.SPY;
  if (!spy || spy.kind !== 'bars') return [];
  return spy.bars.slice(-sessions).map((b) => {
    const q = quickScore(data, b.date, 'close');
    return { date: b.date, score: q.score == null ? null : Math.round(q.score * 10) / 10, categories: q.categories };
  });
}

export async function buildMarketView(data: MarketDataset, now: Date = new Date()): Promise<MarketView> {
  const asOf = latestSession(data) ?? now.toISOString().slice(0, 10);
  const score = computeRiskScore(data, { asOf, mode: 'close', config: DEFAULT_RISK_CONFIG });
  const facts = regimeFacts(data, asOf, 'close', score, DEFAULT_REGIME_CONFIG);
  const regime = classifyRegime(facts, score.score);
  const today = now.toISOString().slice(0, 10);
  let catalysts: Catalyst[] = fomcCatalysts(today, addDays(today, 120));
  let catalystError: string | undefined;
  try {
    const cal = await fetchEconomicCalendar();
    if (cal.sourceError) catalystError = cal.sourceError;
    catalysts = [...catalysts, ...weeklyCatalysts(cal.events).filter((c) => c.date >= today)];
  } catch (e) {
    catalystError = e instanceof Error ? e.message : String(e);
  }
  catalysts.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    generatedAt: now.toISOString(),
    session: equitySession(now).session,
    score,
    regime,
    history: scoreHistory(data, 120),
    catalysts,
    catalystError,
    series: seriesStatus(data),
    errors: data.errors,
    keyLevels: ['SPY', 'QQQ', 'IWM', 'DIA'].map((s) => keyLevels(data, s)),
  };
}
