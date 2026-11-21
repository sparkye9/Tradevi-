/**
 * Assembles the MarketDataset the engines read, for the live dashboard
 * (about three years of history) or the historical simulator (full history).
 * Server-only. Live and historical requests share the fetchers but are
 * cached separately, and imported / webhook breadth is merged in last with
 * its own source label.
 */
import { addDays, type AnySeries, type DataError, type LevelSeries, type MarketDataset } from '../series';
import { SECTOR_ETFS } from '../indicators';
import { CBOE_INDEX_FILES, FRED_SERIES, cboeIndex, etfBars, fredSeries, settleLimited, treasuryCurve } from './fetchers';
import { tradingViewBreadth } from './tradingview';

export const ETF_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'RSP', ...SECTOR_ETFS, 'KRE', 'HYG', 'JNK', 'LQD', 'TLT', 'IEF', 'SHY', 'UUP'];

export interface DatasetOptions {
  /** 'live' fetches ~3 years; 'history' fetches everything available. */
  scope: 'live' | 'history';
  force?: boolean;
}

interface CacheEntry {
  at: number;
  data: MarketDataset;
}
const cache = new Map<string, CacheEntry>();
const TTL = { live: 10 * 60_000, history: 6 * 3600_000 };

function extendWith(base: LevelSeries | undefined, extra: LevelSeries, label: string): LevelSeries {
  if (!base) return extra;
  const last = base.points.length ? base.points[base.points.length - 1].date : '';
  const add = extra.points.filter((p) => p.date > last);
  if (!add.length) return base;
  return { ...base, meta: { ...base.meta, source: `${base.meta.source} + ${label}` }, points: [...base.points, ...add] };
}

export async function buildDataset(opts: DatasetOptions): Promise<MarketDataset> {
  const key = opts.scope;
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < TTL[key]) return hit.data;

  const from = opts.scope === 'live' ? addDays(new Date().toISOString().slice(0, 10), -3 * 365 - 30) : null;
  const series: Record<string, AnySeries> = {};
  const errors: DataError[] = [];

  const jobs: { id: string; run: () => Promise<AnySeries> }[] = [
    ...ETF_SYMBOLS.map((s) => ({ id: s, run: () => etfBars(s, from) })),
    ...Object.keys(CBOE_INDEX_FILES).map((id) => ({ id, run: () => cboeIndex(id, from) })),
    ...FRED_SERIES.map((spec) => ({ id: spec.id, run: () => fredSeries(spec, from) })),
  ];
  const results = await settleLimited(jobs.map((j) => j.run), 6);
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') series[jobs[i].id] = r.value;
    else errors.push({ id: jobs[i].id, error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });

  // Treasury.gov publishes the curve the same evening; FRED lags a day.
  if (opts.scope === 'live') {
    try {
      const t = await treasuryCurve();
      series.UST_10Y = t.y10;
      series.UST_2Y = t.y2;
      series.UST_3M = t.y3m;
      const lbl = 'Treasury.gov (latest)';
      series.DGS10 = extendWith(series.DGS10 as LevelSeries | undefined, { ...t.y10, points: t.y10.points.map((p) => ({ ...p, availableOn: p.date })) }, lbl);
      series.DGS2 = extendWith(series.DGS2 as LevelSeries | undefined, { ...t.y2, points: t.y2.points.map((p) => ({ ...p, availableOn: p.date })) }, lbl);
      series.DGS3MO = extendWith(series.DGS3MO as LevelSeries | undefined, { ...t.y3m, points: t.y3m.points.map((p) => ({ ...p, availableOn: p.date })) }, lbl);
      const m3 = new Map(t.y3m.points.map((p) => [p.date, p.value]));
      const m2 = new Map(t.y2.points.map((p) => [p.date, p.value]));
      const spread = (other: Map<string, number>, id: string, label: string): LevelSeries => ({
        kind: 'level',
        meta: { id, label, source: 'U.S. Treasury', unit: 'pts', freshness: 'Published after each session' },
        points: t.y10.points.filter((p) => other.has(p.date)).map((p) => ({ date: p.date, value: Math.round((p.value - (other.get(p.date) ?? 0)) * 100) / 100 })),
      });
      series.T10Y3M = extendWith(series.T10Y3M as LevelSeries | undefined, spread(m3, 'T10Y3M', '10y − 3m'), lbl);
      series.T10Y2Y = extendWith(series.T10Y2Y as LevelSeries | undefined, spread(m2, 'T10Y2Y', '10y − 2y'), lbl);
    } catch (e) {
      errors.push({ id: 'TREASURY', error: `Treasury.gov: ${e instanceof Error ? e.message : String(e)}` });
    }

    // TradingView alert webhook breadth (optional, needs Supabase).
    try {
      const tv = await tradingViewBreadth();
      for (const s of tv) series[s.meta.id] = s;
    } catch (e) {
      errors.push({ id: 'TRADINGVIEW', error: e instanceof Error ? e.message : String(e) });
    }
  }

  const data: MarketDataset = { series, errors };
  // Don't pin an outage in the cache: only keep results that have the core series.
  if (series.SPY && series.VIX) cache.set(key, { at: Date.now(), data });
  return data;
}

/** Merge user-imported series (e.g. TradingView CSV exports) over a dataset without mutating the cache. */
export function withImported(data: MarketDataset, imported: LevelSeries[]): MarketDataset {
  if (!imported.length) return data;
  const series = { ...data.series };
  for (const s of imported) series[s.meta.id] = s;
  return { series, errors: data.errors };
}
