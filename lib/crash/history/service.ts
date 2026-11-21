/**
 * Server-side Historical Crash Simulator service. Holds the full-history
 * dataset and its point-in-time timeline in memory (rebuilt every 6 hours),
 * loads actual historical chains when present, and answers the simulator's
 * actions. Kept apart from the live dashboard's cache: historical requests
 * never read live data and live pages never read historical data.
 *
 * No Hindsight: `replay` with `noHindsight` returns nothing dated after the
 * replay date (timeline, milestones, prices, declines). Outcomes come only
 * from `reveal`, which the page calls after a decision is recorded.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { DEFAULT_REGIME_CONFIG, DEFAULT_RISK_CONFIG, LEAPS_FILTERS, LONG_TERM_FILTERS, SHORT_TERM_FILTERS, type ScreenFilters } from '../config';
import { buildDataset } from '../providers/dataset';
import { classifyRegime, regimeFacts } from '../regime';
import { computeRiskScore } from '../riskScore';
import { PointInTime, addDays, realizedVol, type CutMode, type MarketDataset } from '../series';
import { DEFAULT_DECLINE, RESEARCH_WINDOWS, detectDeclines, type DeclineDefinition, type DeclineEvent } from './events';
import { historicalHunt } from './funnel';
import { makeManifest, validateDataset, type RunManifest } from './manifest';
import type { HistoricalOptionRow } from './optionsImport';
import { actualPricer, actualSnapshot, theoreticalPricer, theoreticalSnapshot, type ActualChainStore, type ChainSnapshot } from './pricers';
import { DEFAULT_EVAL, evaluateSignal, splitEvaluate, walkForward, type EvalOptions, type SignalRule } from './signals';
import { DEFAULT_LAB, STRATEGIES, runStrategy, type LabSettings, type StrategyDef } from './strategies';
import { THEORETICAL_MODEL, theoreticalContext, theoreticalSmile, type TheoreticalModel } from './theoretical';
import { buildTimeline, firstAppearances, sessions as sessionList, type TimelinePoint } from './timeline';
import { DEFAULT_EXITS, simulateTrade, type EntryMethod, type ExitRules } from './trade';

export interface HistoryState {
  data: MarketDataset;
  timeline: TimelinePoint[];
  sessions: string[];
  builtAt: string;
  validation: ReturnType<typeof validateDataset>;
}

const TTL = 6 * 3600_000;

/**
 * Full-history dataset. For local render tests only, CRASH_HISTORY_FIXTURE
 * may point to a synthetic dataset file; it is ignored in production builds
 * so a deployed simulator can only ever read real providers.
 */
async function loadHistoryDataset(force: boolean): Promise<MarketDataset> {
  const fixture = process.env.CRASH_HISTORY_FIXTURE;
  if (fixture && process.env.NODE_ENV !== 'production') return JSON.parse(await fs.readFile(fixture, 'utf8')) as MarketDataset;
  return buildDataset({ scope: 'history', force });
}
let cached: { at: number; p: Promise<HistoryState> } | null = null;

export function getHistory(force = false): Promise<HistoryState> {
  if (!force && cached && Date.now() - cached.at < TTL) return cached.p;
  const p = (async () => {
    const data = await loadHistoryDataset(force);
    const timeline = buildTimeline(data, { mode: 'close' });
    return { data, timeline, sessions: sessionList(data), builtAt: new Date().toISOString(), validation: validateDataset(data) };
  })();
  cached = { at: Date.now(), p };
  p.catch(() => {
    if (cached?.p === p) cached = null;
  });
  return p;
}

// ─── Actual historical chains ──────────────────────────────────────────────

export const OPTIONS_DIR = path.join(process.cwd(), 'data', 'historical-options');
const stores = new Map<string, { at: number; store: ActualChainStore | null }>();

/** Rows the importer wrote locally (data/historical-options/<SYMBOL>/<YYYY-MM>.json), never committed. */
async function localRows(symbol: string): Promise<HistoricalOptionRow[]> {
  const dir = path.join(OPTIONS_DIR, symbol.toUpperCase());
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
  } catch {
    return [];
  }
  const out: HistoricalOptionRow[] = [];
  for (const f of files.sort()) {
    try {
      const rows = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) as HistoricalOptionRow[];
      out.push(...rows);
    } catch {
      /* unreadable month: skipped, shown as missing coverage */
    }
  }
  return out;
}

/** Tradevi's own daily snapshots from Supabase (genuine history from the day recording began). */
async function snapshotRows(symbol: string): Promise<HistoricalOptionRow[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const out: HistoricalOptionRow[] = [];
    for (let page = 0; page < 200; page++) {
      const { data, error } = await admin
        .from('crash_option_snapshots')
        .select('trade_date,captured_at,underlying,underlying_price,option_symbol,option_type,expiration,strike,bid,ask,last,volume,open_interest,delta,gamma,theta,vega,iv')
        .eq('underlying', symbol.toUpperCase())
        .eq('option_type', 'put')
        .order('trade_date', { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (error || !data?.length) break;
      for (const r of data as Record<string, unknown>[]) {
        const n = (v: unknown) => (v == null ? null : Number(v));
        out.push({
          tradeDate: String(r.trade_date),
          quoteTime: r.captured_at ? String(r.captured_at) : null,
          underlying: String(r.underlying),
          optionSymbol: String(r.option_symbol),
          type: 'put',
          strike: Number(r.strike),
          expiration: String(r.expiration),
          bid: n(r.bid),
          ask: n(r.ask),
          last: n(r.last),
          volume: n(r.volume),
          openInterest: n(r.open_interest),
          iv: n(r.iv),
          delta: n(r.delta),
          gamma: n(r.gamma),
          theta: n(r.theta),
          vega: n(r.vega),
          underlyingPrice: n(r.underlying_price),
          multiplier: 100,
          source: 'Tradevi daily snapshot (Tradier)',
        });
      }
      if (data.length < 1000) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function actualStore(symbol: string): Promise<ActualChainStore | null> {
  const key = symbol.toUpperCase();
  const hit = stores.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.store;
  const rows = [...(await localRows(key)), ...(await snapshotRows(key))];
  let store: ActualChainStore | null = null;
  if (rows.length) {
    const byDate = new Map<string, HistoricalOptionRow[]>();
    for (const r of rows) {
      const list = byDate.get(r.tradeDate) ?? [];
      list.push(r);
      byDate.set(r.tradeDate, list);
    }
    store = { symbol: key, source: Array.from(new Set(rows.map((r) => r.source))).join(' + '), byDate };
  }
  stores.set(key, { at: Date.now(), store });
  return store;
}

export interface OptionsCoverage {
  symbol: string;
  dates: number;
  first: string | null;
  last: string | null;
  source: string | null;
}

export async function optionsCoverage(symbols: string[]): Promise<OptionsCoverage[]> {
  const out: OptionsCoverage[] = [];
  for (const s of symbols) {
    const st = await actualStore(s);
    const dates = st ? Array.from(st.byDate.keys()).sort() : [];
    out.push({ symbol: s, dates: dates.length, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null, source: st?.source ?? null });
  }
  return out;
}

function rateOn(data: MarketDataset, date: string): number {
  const l = new PointInTime(data, date, 'close').latest('DGS3MO');
  return l ? l.value / 100 : 0.04;
}

async function snapshotFor(h: HistoryState, symbol: string, date: string, f: ScreenFilters, preferTheoretical: boolean, model: TheoreticalModel): Promise<ChainSnapshot | { error: string }> {
  if (!preferTheoretical) {
    const st = await actualStore(symbol);
    if (st) {
      const snap = actualSnapshot(st, date, f.minDte, f.maxDte, rateOn(h.data, date), 0);
      if (snap) return snap;
    }
  }
  return theoreticalSnapshot(h.data, symbol, date, f.minDte, f.maxDte, model);
}

// ─── Actions ───────────────────────────────────────────────────────────────

export const HORIZON_FILTERS: Record<'short' | 'long' | 'leaps', ScreenFilters> = { short: SHORT_TERM_FILTERS, long: LONG_TERM_FILTERS, leaps: LEAPS_FILTERS };

export function clampDate(h: HistoryState, date: string): string {
  const s = h.sessions;
  if (!s.length) return date;
  if (date <= s[0]) return s[0];
  for (let i = s.length - 1; i >= 0; i--) if (s[i] <= date) return s[i];
  return s[0];
}

function closeOn(data: MarketDataset, sym: string, date: string, mode: CutMode): { date: string; close: number } | null {
  const b = new PointInTime(data, date, mode).bars(sym);
  const last = b[b.length - 1];
  return last ? { date: last.date, close: last.close } : null;
}

export async function replay(args: { date: string; mode: CutMode; symbols: string[]; noHindsight: boolean }) {
  const h = await getHistory();
  const date = clampDate(h, args.date);
  const score = computeRiskScore(h.data, { asOf: date, mode: args.mode, config: DEFAULT_RISK_CONFIG });
  const facts = regimeFacts(h.data, date, args.mode, score, DEFAULT_REGIME_CONFIG);
  const regime = classifyRegime(facts, score.score);
  const p = new PointInTime(h.data, date, args.mode);
  const availability = Object.values(h.data.series).map((s) => {
    const last = p.latest(s.meta.id);
    const lastBar = s.kind === 'bars' ? p.bars(s.meta.id).slice(-1)[0] : null;
    const lastDate = last?.date ?? lastBar?.date ?? null;
    const firstAll = s.kind === 'bars' ? s.bars[0]?.date : s.points[0]?.date;
    return {
      id: s.meta.id,
      label: s.meta.label,
      source: s.meta.source,
      lastObservation: lastDate,
      availableOn: last && 'availableOn' in last ? (last as { availableOn?: string }).availableOn ?? last.date : lastDate,
      historyStarts: firstAll ?? null,
      available: !!lastDate,
      strictPointInTime: !(s.meta.revisable && !s.meta.vintage),
      note: !lastDate ? (firstAll && firstAll > date ? `History starts ${firstAll}` : 'No data') : s.meta.revisable && !s.meta.vintage ? 'Revised values (no first-release vintage): not strict point-in-time' : undefined,
    };
  });
  const visibleTl = args.noHindsight ? h.timeline.filter((t) => t.date <= date) : h.timeline;
  const window = RESEARCH_WINDOWS.find((w) => date >= w.start && date <= w.end) ?? null;
  const milestones = RESEARCH_WINDOWS.flatMap((w) => w.milestones.map((m) => ({ ...m, window: w.id }))).filter((m) => (args.noHindsight ? m.date <= date && !m.hindsight : true));
  const idx = h.sessions.indexOf(date);
  const tlFrom = addDays(date, -730);
  return {
    date,
    mode: args.mode,
    prevSession: idx > 0 ? h.sessions[idx - 1] : null,
    nextSession: idx >= 0 && idx < h.sessions.length - 1 ? h.sessions[idx + 1] : null,
    firstSession: h.sessions[0] ?? null,
    lastSession: h.sessions[h.sessions.length - 1] ?? null,
    noHindsight: args.noHindsight,
    score,
    regime,
    conditions: ['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'KRE', ...args.symbols].filter((v, i, a) => a.indexOf(v) === i).map((s) => ({ symbol: s, ...(closeOn(h.data, s, date, args.mode) ?? { date: null, close: null }) })),
    vix: p.latest('VIX'),
    availability,
    timeline: visibleTl.filter((t) => t.date >= tlFrom && (args.noHindsight || t.date <= addDays(date, 365))),
    regimeFirst: window ? firstAppearances(h.timeline, window.start, args.noHindsight ? date : window.end) : null,
    window,
    milestones,
    windows: RESEARCH_WINDOWS.map((w) => ({ id: w.id, label: w.label, start: w.start, end: w.end, focus: w.focus, symbols: w.symbols })),
    builtAt: h.builtAt,
    errors: h.data.errors,
  };
}

/** What happened after `date`. Called only after the user records a decision (or with hindsight on). */
export async function reveal(args: { date: string; symbols: string[]; sessionsAhead: number; decline: DeclineDefinition }) {
  const h = await getHistory();
  const date = clampDate(h, args.date);
  const idx = h.sessions.indexOf(date);
  const ahead = h.sessions.slice(idx, idx + 1 + Math.min(500, Math.max(20, args.sessionsAhead)));
  const end = ahead[ahead.length - 1];
  const paths = args.symbols.map((sym) => {
    const s = h.data.series[sym];
    const bars = s && s.kind === 'bars' ? s.bars.filter((b) => b.date >= date && b.date <= end) : [];
    const start = bars[0]?.close ?? null;
    let minClose = Infinity;
    let minDate: string | null = null;
    for (const b of bars) if (b.close < minClose) {
      minClose = b.close;
      minDate = b.date;
    }
    return { symbol: sym, path: bars.map((b) => ({ date: b.date, close: b.close })), start, worst: start ? minClose / start - 1 : null, worstDate: minDate, end: bars[bars.length - 1]?.close ?? null };
  });
  const spy = h.data.series.SPY;
  const events = spy && spy.kind === 'bars' ? detectDeclines(spy.bars, args.decline) : [];
  return {
    date,
    end,
    paths,
    nextDecline: events.find((e) => e.crossDate > date) ?? null,
    activeDecline: events.find((e) => e.crossDate <= date && (e.endDate == null || e.endDate >= date)) ?? null,
    timeline: h.timeline.filter((t) => t.date > date && t.date <= end),
    milestones: RESEARCH_WINDOWS.flatMap((w) => w.milestones).filter((m) => m.date > date && m.date <= end),
  };
}

export async function historicalChain(args: { symbol: string; date: string; horizon: 'short' | 'long' | 'leaps'; filters?: Partial<ScreenFilters>; theoretical: boolean; model?: Partial<TheoreticalModel> }) {
  const h = await getHistory();
  const date = clampDate(h, args.date);
  const f: ScreenFilters = { ...HORIZON_FILTERS[args.horizon], ...(args.filters ?? {}) };
  const model = { ...THEORETICAL_MODEL, ...(args.model ?? {}) };
  const store = await actualStore(args.symbol);
  const actual = store ? actualSnapshot(store, date, f.minDte, f.maxDte, rateOn(h.data, date), 0) : null;
  const status = actual ? ('ACTUAL' as const) : ('HISTORICAL OPTIONS DATA UNAVAILABLE' as const);
  if (!actual && !args.theoretical) return { date, symbol: args.symbol, status, coverage: (await optionsCoverage([args.symbol]))[0], funnel: null, model };
  const snap = actual ?? theoreticalSnapshot(h.data, args.symbol, date, f.minDte, f.maxDte, model);
  if ('error' in snap) return { date, symbol: args.symbol, status, coverage: (await optionsCoverage([args.symbol]))[0], funnel: null, error: snap.error, model };
  const score = computeRiskScore(h.data, { asOf: date, mode: 'close' });
  const facts = regimeFacts(h.data, date, 'close', score);
  const regime = classifyRegime(facts, score.score);
  const ctx = snap.kind === 'theoretical' ? theoreticalContext(h.data, args.symbol, date, model) : null;
  const funnel = historicalHunt({
    kind: snap.kind,
    date,
    symbol: args.symbol,
    contracts: snap.contracts,
    S: snap.S,
    realizedVol20: realizedVol(new PointInTime(h.data, date, 'close').closes(args.symbol), 20),
    r: snap.r,
    q: snap.q,
    filters: f,
    market: { score: score.score, regime: regime.regime, facts },
    catalystsBefore: () => 0,
    smileFor: ctx && !('error' in ctx) ? (dte) => theoreticalSmile(ctx, dte) : undefined,
  });
  return { date, symbol: args.symbol, status, coverage: (await optionsCoverage([args.symbol]))[0], funnel, source: snap.source, model, regime: regime.regime, score: score.score };
}

export interface TradeParams {
  symbol: string;
  date: string;
  optionSymbol: string;
  strike: number;
  expiration: string;
  kind: 'actual' | 'theoretical';
  entry: { method: EntryMethod; price?: number; limitDays?: number };
  exitFill: 'bid' | 'mid';
  contracts: number;
  feePerContract: number;
  exits: Partial<ExitRules>;
  model?: Partial<TheoreticalModel>;
}

export async function historicalTrade(p: TradeParams) {
  const h = await getHistory();
  const date = clampDate(h, p.date);
  const model = { ...THEORETICAL_MODEL, ...(p.model ?? {}) };
  let pricer;
  if (p.kind === 'actual') {
    const st = await actualStore(p.symbol);
    if (!st) return { error: 'No actual historical chain is loaded for this symbol.' };
    pricer = actualPricer(st, p.optionSymbol, p.strike, p.expiration);
  } else pricer = theoreticalPricer(h.data, p.symbol, p.strike, p.expiration, model);
  const tl = new Map(h.timeline.map((t) => [t.date, t]));
  const result = simulateTrade({
    pricer,
    sessions: h.sessions.slice(h.sessions.indexOf(date)),
    entry: p.entry,
    exitFill: p.exitFill,
    contracts: p.contracts,
    feePerContract: p.feePerContract,
    exits: { ...DEFAULT_EXITS, ...p.exits },
    context: (d) => {
      const t = tl.get(d);
      return t ? { regime: t.insufficient ? null : t.regime, vix: t.vix } : null;
    },
  });
  const manifest = makeManifest({ kind: 'trade', params: p, data: h.data, range: { from: date, to: result.exitDate ?? date }, options: { kind: p.kind, source: p.kind === 'theoretical' ? 'THEORETICAL model' : pricer.symbol }, result: { net: result.net, exit: result.exitDate } });
  return { result, manifest };
}

export interface EvaluateParams {
  decline: DeclineDefinition;
  rule: SignalRule;
  eval: EvalOptions;
  splitDate: string;
  walkForward: { candidates: number[]; trainYears: number; testYears: number };
  from?: string;
  to?: string;
}

export const DEFAULT_EVALUATE: EvaluateParams = {
  decline: DEFAULT_DECLINE,
  rule: { kind: 'score', min: 40 },
  eval: DEFAULT_EVAL,
  splitDate: '2016-01-01',
  walkForward: { candidates: [25, 30, 35, 40, 45, 50, 55, 60], trainYears: 6, testYears: 2 },
};

export function eventsFor(h: HistoryState, decline: DeclineDefinition): DeclineEvent[] {
  const spy = h.data.series.SPY;
  return spy && spy.kind === 'bars' ? detectDeclines(spy.bars, decline) : [];
}

export async function evaluate(params: EvaluateParams) {
  const h = await getHistory();
  const tl = h.timeline.filter((t) => (!params.from || t.date >= params.from) && (!params.to || t.date <= params.to));
  const events = eventsFor(h, params.decline);
  const report = evaluateSignal(tl, events, params.rule, params.eval);
  const split = splitEvaluate(tl, events, params.rule, params.splitDate, params.eval);
  const wf = walkForward(tl, events, { ...params.walkForward, defaultMin: params.rule.kind === 'score' ? params.rule.min : 40, eval: params.eval });
  const windows = RESEARCH_WINDOWS.map((w) => ({ id: w.id, label: w.label, first: firstAppearances(h.timeline, w.start, w.end) }));
  // Score path around each decline, for the lead-time chart.
  const range = { from: tl[0]?.date ?? '', to: tl[tl.length - 1]?.date ?? '' };
  const manifest = makeManifest({ kind: 'evaluation', params, data: h.data, range, options: { kind: 'none', source: 'Signals only' }, result: report.stats });
  return { report, split, walkForward: wf, windows, manifest, validation: h.validation, sampled: tl.filter((_, i) => i % 5 === 0).map((t) => ({ date: t.date, score: t.score, regime: t.regime, spy: t.spy })) };
}

export interface LabParams {
  settings: Partial<LabSettings>;
  strategies: StrategyDef['id'][];
  overrides?: Partial<Record<StrategyDef['id'], { entryMin?: number; exits?: Partial<ExitRules>; filters?: Partial<ScreenFilters> }>>;
  decline: DeclineDefinition;
  preferTheoretical?: boolean;
  model?: Partial<TheoreticalModel>;
}

export async function lab(params: LabParams) {
  const h = await getHistory();
  const settings: LabSettings = { ...DEFAULT_LAB, ...params.settings };
  const model = { ...THEORETICAL_MODEL, ...(params.model ?? {}) };
  const events = eventsFor(h, params.decline);
  const store = params.preferTheoretical ? null : await actualStore(settings.symbol);
  const r = (d: string) => rateOn(h.data, d);
  const reports = STRATEGIES.filter((s) => params.strategies.includes(s.id)).map((base) => {
    const o = params.overrides?.[base.id];
    const def: StrategyDef = {
      ...base,
      entry: o?.entryMin != null && base.entry.kind === 'score' ? { kind: 'score', min: o.entryMin } : base.entry,
      exits: { ...base.exits, ...(o?.exits ?? {}) },
      filters: { ...base.filters, ...(o?.filters ?? {}) },
    };
    return runStrategy({
      def,
      settings,
      data: h.data,
      timeline: h.timeline,
      events,
      sessions: h.sessions,
      chain: (sym, date, minDte, maxDte) => (store && actualSnapshot(store, date, minDte, maxDte, r(date), 0)) || theoreticalSnapshot(h.data, sym, date, minDte, maxDte, model),
      pricer: (snap, ev) => (snap.kind === 'actual' && store ? actualPricer(store, ev.contract.symbol, ev.contract.strike, ev.contract.expiration) : theoreticalPricer(h.data, settings.symbol, ev.contract.strike, ev.contract.expiration, model)),
    });
  });
  const kinds = reports.reduce((a, x) => ({ actual: a.actual + x.kinds.actual, theoretical: a.theoretical + x.kinds.theoretical }), { actual: 0, theoretical: 0 });
  const optKind = kinds.actual && kinds.theoretical ? 'mixed' : kinds.actual ? 'actual' : kinds.theoretical ? 'theoretical' : 'none';
  const manifest = makeManifest({
    kind: 'lab',
    params: { ...params, settings, model },
    data: h.data,
    range: { from: settings.from, to: settings.to < (h.sessions[h.sessions.length - 1] ?? settings.to) ? settings.to : h.sessions[h.sessions.length - 1] ?? settings.to },
    options: { kind: optKind, source: optKind === 'theoretical' ? 'THEORETICAL model' : store?.source ?? 'THEORETICAL model' },
    result: reports.map((x) => ({ id: x.def.id, net: Math.round(x.stats.net * 100) / 100, trades: x.stats.trades })),
  });
  return { reports, settings, model, events: events.filter((e) => e.crossDate >= settings.from && e.crossDate <= settings.to), manifest };
}

export type { RunManifest };

/**
 * Put Hunter over a date range (every `step` sessions): when it would first
 * have shown WATCH-or-better contracts, and what they cost. Uses actual
 * chains where loaded, otherwise the THEORETICAL model.
 */
export async function scanWindow(args: { symbol: string; from: string; to: string; horizon: 'short' | 'long' | 'leaps'; step: number; theoretical: boolean; model?: Partial<TheoreticalModel> }) {
  const h = await getHistory();
  const f = HORIZON_FILTERS[args.horizon];
  const model = { ...THEORETICAL_MODEL, ...(args.model ?? {}) };
  const dates = h.sessions.filter((d) => d >= args.from && d <= args.to).filter((_, i) => i % Math.max(1, args.step) === 0).slice(0, 160);
  const tl = new Map(h.timeline.map((t) => [t.date, t]));
  const rows: { date: string; kind: 'actual' | 'theoretical' | null; regime: string | null; score: number | null; passing: number; aligned: number; best: { symbol: string; ask: number | null; quality: number | null; label: string } | null; cheapest: { symbol: string; ask: number | null } | null; note?: string }[] = [];
  for (const date of dates) {
    const snap = await snapshotFor(h, args.symbol, date, f, false, model);
    if ('error' in snap || (snap.kind === 'theoretical' && !args.theoretical)) {
      rows.push({ date, kind: null, regime: tl.get(date)?.regime ?? null, score: tl.get(date)?.score ?? null, passing: 0, aligned: 0, best: null, cheapest: null, note: 'error' in snap ? snap.error : 'HISTORICAL OPTIONS DATA UNAVAILABLE' });
      continue;
    }
    const score = computeRiskScore(h.data, { asOf: date, mode: 'close' });
    const facts = regimeFacts(h.data, date, 'close', score);
    const regime = classifyRegime(facts, score.score);
    const ctx = snap.kind === 'theoretical' ? theoreticalContext(h.data, args.symbol, date, model) : null;
    const fun = historicalHunt({
      kind: snap.kind,
      date,
      symbol: args.symbol,
      contracts: snap.contracts,
      S: snap.S,
      realizedVol20: realizedVol(new PointInTime(h.data, date, 'close').closes(args.symbol), 20),
      r: snap.r,
      q: snap.q,
      filters: f,
      market: { score: score.score, regime: regime.regime, facts },
      catalystsBefore: () => 0,
      smileFor: ctx && !('error' in ctx) ? (dte) => theoreticalSmile(ctx, dte) : undefined,
      scenarioTop: 3,
    });
    const top = fun.rows[0];
    const cheap = fun.rows.find((r) => r.ev.contract.symbol === fun.picks.cheapest);
    rows.push({
      date,
      kind: snap.kind,
      regime: regime.insufficient ? null : regime.regime,
      score: score.score,
      passing: fun.stages.find((s) => s.id === 'liquidity')?.count ?? 0,
      aligned: fun.stages.find((s) => s.id === 'aligned')?.count ?? 0,
      best: top ? { symbol: top.ev.contract.symbol, ask: top.ev.contract.ask, quality: top.ev.quality, label: top.setup.label } : null,
      cheapest: cheap ? { symbol: cheap.ev.contract.symbol, ask: cheap.ev.contract.ask } : null,
    });
  }
  const first = rows.find((r) => r.aligned > 0) ?? null;
  return { symbol: args.symbol, horizon: args.horizon, rows, firstQualifying: first };
}
