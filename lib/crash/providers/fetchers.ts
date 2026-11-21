/**
 * Raw fetchers for Crash Intelligence. Server-only. Each returns a typed
 * series with its source label, or throws with a message that names the
 * source. Nothing here invents a value: unparseable rows are dropped.
 *
 *   Yahoo chart API  — ETF / index daily bars, ~15–20 min delayed, keyless
 *   Stooq CSV        — end-of-day ETF bars, fallback when Yahoo refuses
 *   Cboe CSV         — official daily VIX-family / SKEW history, keyless
 *   FRED / ALFRED    — credit spreads, yields, stress indices (API key optional;
 *                      with FRED_API_KEY first-release vintages are used)
 *   Treasury.gov     — daily par yield curve, published after the close
 */
import { etDate } from '../../indicators';
import { parseYahooBars } from '../../yahooChart';
import { fetchStooqDaily } from '../../stooq';
import { addDays, nextWeekday, type Bar, type BarSeries, type LevelPoint, type LevelSeries } from '../series';

const UA = 'Mozilla/5.0 (compatible; Tradevi/3.0)';

async function getText(url: string, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) {
      // Keep the provider's own reason (FRED explains a bad key in the body).
      let detail = '';
      try {
        const body = await res.text();
        const m = /"error_message"\s*:\s*"([^"]+)"/.exec(body);
        detail = m ? `: ${m[1]}` : '';
      } catch {
        /* no body */
      }
      throw new Error(`HTTP ${res.status}${detail}`);
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ─── Yahoo / Stooq bars ─────────────────────────────────────────────────────

/** Daily bars from Yahoo; `fromYmd` null = full history. */
export async function yahooDaily(symbol: string, fromYmd: string | null): Promise<Bar[]> {
  const p1 = fromYmd ? Math.floor(Date.parse(`${fromYmd}T00:00:00Z`) / 1000) : 0;
  const p2 = Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d&includePrePost=false&events=div%2Csplit`;
  const text = await getText(url);
  if (text.trimStart().startsWith('<')) throw new Error('Yahoo returned an HTML page (rate-limited or blocked)');
  const json = JSON.parse(text);
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(`Yahoo: ${json?.chart?.error?.description ?? 'no data'}`);
  const q = r.indicators?.quote?.[0] ?? {};
  const candles = parseYahooBars(r.timestamp ?? [], q.open ?? [], q.high ?? [], q.low ?? [], q.close ?? [], q.volume ?? []);
  return dedupeBars(candles.map((c) => ({ date: etDate(c.time), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })));
}

function dedupeBars(bars: Bar[]): Bar[] {
  const m = new Map<string, Bar>();
  for (const b of bars) m.set(b.date, b);
  return Array.from(m.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * ETF bars, Yahoo first then Stooq. Yahoo "close" is split-adjusted but not
 * dividend-adjusted, which is what price signals should use.
 */
export async function etfBars(symbol: string, fromYmd: string | null): Promise<BarSeries> {
  const problems: string[] = [];
  try {
    const bars = await yahooDaily(symbol, fromYmd);
    if (bars.length >= 30) {
      return { kind: 'bars', meta: { id: symbol, label: symbol, source: 'Yahoo (delayed)', unit: '$', freshness: '15–20 min delayed during the session', fetchedAt: new Date().toISOString() }, bars };
    }
    problems.push(`Yahoo returned ${bars.length} bars`);
  } catch (e) {
    problems.push(`Yahoo: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const { candles } = await fetchStooqDaily(`${symbol.toLowerCase()}.us`);
    const bars = dedupeBars(candles.map((c) => ({ date: etDate(c.time), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))).filter((b) => !fromYmd || b.date >= fromYmd);
    if (bars.length >= 30) {
      return { kind: 'bars', meta: { id: symbol, label: symbol, source: 'Stooq (end of day)', unit: '$', freshness: 'End of day', fetchedAt: new Date().toISOString() }, bars };
    }
    problems.push(`Stooq returned ${bars.length} bars`);
  } catch (e) {
    problems.push(`Stooq: ${e instanceof Error ? e.message : String(e)}`);
  }
  throw new Error(problems.join('; '));
}

// ─── Cboe ───────────────────────────────────────────────────────────────────

export const CBOE_INDEX_FILES: Record<string, { file: string; label: string; yahoo: string }> = {
  VIX: { file: 'VIX_History.csv', label: 'VIX', yahoo: '^VIX' },
  VIX3M: { file: 'VIX3M_History.csv', label: 'VIX3M', yahoo: '^VIX3M' },
  VIX9D: { file: 'VIX9D_History.csv', label: 'VIX9D', yahoo: '^VIX9D' },
  SKEW: { file: 'SKEW_History.csv', label: 'Cboe SKEW', yahoo: '^SKEW' },
  VXN: { file: 'VXN_History.csv', label: 'VXN (Nasdaq-100 vol)', yahoo: '^VXN' },
  RVX: { file: 'RVX_History.csv', label: 'RVX (Russell 2000 vol)', yahoo: '^RVX' },
};

function mdyToYmd(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return s.trim();
  return null;
}

/** Parse a Cboe index history CSV (DATE, … , CLOSE or DATE, VALUE). */
export function parseCboeCsv(text: string): LevelPoint[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim().toUpperCase());
  const iDate = header.indexOf('DATE');
  let iVal = header.indexOf('CLOSE');
  if (iVal < 0) iVal = header.length - 1;
  if (iDate < 0) throw new Error(`Unexpected Cboe header: ${lines[0].slice(0, 60)}`);
  const out: LevelPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const d = mdyToYmd(cells[iDate] ?? '');
    const v = Number(cells[iVal]);
    if (d && Number.isFinite(v) && v > 0) out.push({ date: d, value: v });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

/** VIX-family index: Cboe's official CSV, with Yahoo filling the latest (delayed) session. */
export async function cboeIndex(id: string, fromYmd: string | null): Promise<LevelSeries> {
  const spec = CBOE_INDEX_FILES[id];
  if (!spec) throw new Error(`Unknown Cboe index ${id}`);
  let points: LevelPoint[] = [];
  let source = 'Cboe (end of day)';
  const problems: string[] = [];
  try {
    points = parseCboeCsv(await getText(`https://cdn.cboe.com/api/global/us_indices/daily_prices/${spec.file}`));
  } catch (e) {
    problems.push(`Cboe: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const y = await yahooDaily(spec.yahoo, points.length ? addDays(points[points.length - 1].date, -5) : fromYmd);
    const known = new Set(points.map((p) => p.date));
    const extra = y.filter((b) => !known.has(b.date)).map((b) => ({ date: b.date, value: b.close }));
    if (extra.length) {
      points = [...points, ...extra].sort((a, b) => (a.date < b.date ? -1 : 1));
      source = points.length === extra.length ? 'Yahoo (delayed)' : 'Cboe + Yahoo (latest, delayed)';
    }
  } catch (e) {
    problems.push(`Yahoo: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!points.length) throw new Error(problems.join('; '));
  if (fromYmd) points = points.filter((p) => p.date >= fromYmd);
  return { kind: 'level', meta: { id, label: spec.label, source, unit: 'index', freshness: 'Official close from Cboe; latest session from Yahoo is delayed', fetchedAt: new Date().toISOString() }, points };
}

// ─── FRED / ALFRED ──────────────────────────────────────────────────────────

export interface FredSpec {
  id: string;
  fred: string;
  label: string;
  unit: string;
  /** Approximate publication lag when vintages are not available. */
  lag: 'next_weekday' | 'weekly_thursday' | 'weekly_wednesday';
  revisable: boolean;
  license?: string;
}

export const FRED_SERIES: FredSpec[] = [
  { id: 'HY_OAS', fred: 'BAMLH0A0HYM2', label: 'ICE BofA US High Yield OAS', unit: '%', lag: 'next_weekday', revisable: false, license: 'ICE Data Indices; FRED may show limited history for ICE series' },
  { id: 'IG_OAS', fred: 'BAMLC0A0CM', label: 'ICE BofA US Corporate (IG) OAS', unit: '%', lag: 'next_weekday', revisable: false, license: 'ICE Data Indices; FRED may show limited history for ICE series' },
  { id: 'BAA', fred: 'DBAA', label: 'Moody’s Seasoned Baa Corporate Yield', unit: '%', lag: 'next_weekday', revisable: false, license: 'Moody’s via FRED' },
  { id: 'AAA', fred: 'DAAA', label: 'Moody’s Seasoned Aaa Corporate Yield', unit: '%', lag: 'next_weekday', revisable: false, license: 'Moody’s via FRED' },
  { id: 'DGS10', fred: 'DGS10', label: '10-Year Treasury yield', unit: '%', lag: 'next_weekday', revisable: false },
  { id: 'DGS2', fred: 'DGS2', label: '2-Year Treasury yield', unit: '%', lag: 'next_weekday', revisable: false },
  { id: 'DGS3MO', fred: 'DGS3MO', label: '3-Month Treasury bill yield', unit: '%', lag: 'next_weekday', revisable: false },
  { id: 'T10Y2Y', fred: 'T10Y2Y', label: '10-Year minus 2-Year Treasury', unit: 'pts', lag: 'next_weekday', revisable: false },
  { id: 'T10Y3M', fred: 'T10Y3M', label: '10-Year minus 3-Month Treasury', unit: 'pts', lag: 'next_weekday', revisable: false },
  { id: 'STLFSI', fred: 'STLFSI4', label: 'St. Louis Fed Financial Stress Index', unit: 'index', lag: 'weekly_thursday', revisable: true },
  { id: 'NFCI', fred: 'NFCI', label: 'Chicago Fed National Financial Conditions Index', unit: 'index', lag: 'weekly_wednesday', revisable: true },
];

function approxAvailable(date: string, lag: FredSpec['lag']): string {
  if (lag === 'next_weekday') return nextWeekday(date);
  // Weekly series are dated the Friday of the week they describe.
  return addDays(date, lag === 'weekly_thursday' ? 6 : 5);
}

export function parseFredCsv(text: string): { date: string; value: number }[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || !/date/i.test(lines[0])) throw new Error(`FRED did not return a CSV table (${lines[0]?.slice(0, 60)})`);
  const out: { date: string; value: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [d, v] = lines[i].split(',');
    const n = Number(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v !== '.' && Number.isFinite(n)) out.push({ date: d, value: n });
  }
  return out;
}

export async function fredSeries(spec: FredSpec, fromYmd: string | null): Promise<LevelSeries> {
  // Trim: a key pasted into the Vercel dashboard often carries a trailing
  // newline or quotes, which FRED rejects as "api_key is not registered".
  const key = process.env.FRED_API_KEY?.trim().replace(/^['"]|['"]$/g, '') || undefined;
  const start = fromYmd ?? '1990-01-01';
  if (key) {
    // output_type=4 → initial release only, with the date it was first published.
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${spec.fred}&api_key=${encodeURIComponent(key)}&file_type=json&observation_start=${start}${spec.revisable ? '&realtime_start=1776-07-04&realtime_end=9999-12-31&output_type=4' : ''}`;
    const json = JSON.parse(await getText(url, 20000));
    if (json.error_message) throw new Error(`FRED: ${json.error_message}`);
    const points: LevelPoint[] = (json.observations ?? [])
      .filter((o: { value: string }) => o.value !== '.' && Number.isFinite(Number(o.value)))
      .map((o: { date: string; value: string; realtime_start?: string }) => ({
        date: o.date,
        value: Number(o.value),
        availableOn: spec.revisable && o.realtime_start ? o.realtime_start : approxAvailable(o.date, spec.lag),
      }));
    return {
      kind: 'level',
      meta: { id: spec.id, label: spec.label, source: spec.revisable ? 'ALFRED (first release)' : 'FRED', unit: spec.unit, freshness: spec.lag === 'next_weekday' ? 'Daily, about one business day behind' : 'Weekly', revisable: spec.revisable, vintage: spec.revisable, license: spec.license, fetchedAt: new Date().toISOString() },
      points,
    };
  }
  const rows = parseFredCsv(await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${spec.fred}&cosd=${start}`, 20000));
  return {
    kind: 'level',
    meta: { id: spec.id, label: spec.label, source: 'FRED (keyless CSV)', unit: spec.unit, freshness: spec.lag === 'next_weekday' ? 'Daily, about one business day behind' : 'Weekly', revisable: spec.revisable, vintage: false, license: spec.license, fetchedAt: new Date().toISOString() },
    points: rows.map((r) => ({ ...r, availableOn: approxAvailable(r.date, spec.lag) })),
  };
}

// ─── Treasury.gov par yield curve ───────────────────────────────────────────

export function parseTreasuryCsv(text: string): Map<string, Record<string, number>> {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
  const out = new Map<string, Record<string, number>>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.replace(/"/g, '').trim());
    const d = mdyToYmd(cells[0]);
    if (!d) continue;
    const row: Record<string, number> = {};
    header.forEach((h, j) => {
      if (j === 0) return;
      const n = Number(cells[j]);
      if (cells[j] !== '' && Number.isFinite(n)) row[h] = n;
    });
    out.set(d, row);
  }
  return out;
}

/** Same-day par yields (3 Mo, 2 Yr, 10 Yr) for the current and previous calendar year. */
export async function treasuryCurve(): Promise<{ y3m: LevelSeries; y2: LevelSeries; y10: LevelSeries }> {
  const year = new Date().getUTCFullYear();
  const rows = new Map<string, Record<string, number>>();
  for (const y of [year - 1, year]) {
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
    parseTreasuryCsv(await getText(url)).forEach((v, k) => rows.set(k, v));
  }
  const dates = Array.from(rows.keys()).sort();
  const mk = (col: string, id: string, label: string): LevelSeries => ({
    kind: 'level',
    meta: { id, label, source: 'U.S. Treasury (par yield curve)', unit: '%', freshness: 'Published after each session', fetchedAt: new Date().toISOString() },
    points: dates.filter((d) => rows.get(d)![col] != null).map((d) => ({ date: d, value: rows.get(d)![col] })),
  });
  return { y3m: mk('3 Mo', 'UST_3M', 'Treasury 3-month par yield'), y2: mk('2 Yr', 'UST_2Y', 'Treasury 2-year par yield'), y10: mk('10 Yr', 'UST_10Y', 'Treasury 10-year par yield') };
}

/** Run async jobs with a concurrency cap; never rejects. */
export async function settleLimited<T>(jobs: (() => Promise<T>)[], limit = 6): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await jobs[i]() };
      } catch (e) {
        out[i] = { status: 'rejected', reason: e };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return out;
}
