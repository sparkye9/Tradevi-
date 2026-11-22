import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import type { NumericFilterKey, ScreenFilters } from '@/lib/crash/config';
import { DEFAULT_DECLINE, type DeclineDefinition } from '@/lib/crash/history/events';
import { DEFAULT_EVAL, type SignalRule } from '@/lib/crash/history/signals';
import type { Regime } from '@/lib/crash/regime';
import { REGIME_ORDER } from '@/lib/crash/regime';
import {
  DEFAULT_EVALUATE,
  evaluate,
  getHistory,
  historicalChain,
  historicalTrade,
  lab,
  optionsCoverage,
  replay,
  reveal,
  scanWindow,
  type LabParams,
  type TradeParams,
} from '@/lib/crash/history/service';
import { RESEARCH_WINDOWS } from '@/lib/crash/history/events';
import { STRATEGIES } from '@/lib/crash/history/strategies';
import { THEORETICAL_MODEL, type TheoreticalModel } from '@/lib/crash/history/theoretical';
import type { ExitRules } from '@/lib/crash/history/trade';

export const runtime = 'nodejs';
// A cold start fetches ~45 full-history series and scores every session since 1993/2005.
// The first request on a fresh server replays ~20 years of real data.
export const maxDuration = 300;

const SIM_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'KRE'];
const ymd = (v: unknown, fallback: string) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);
const sym = (v: unknown) => (typeof v === 'string' && SIM_SYMBOLS.includes(v.toUpperCase()) ? v.toUpperCase() : 'SPY');
const numIn = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const numOrNull = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);

function decline(v: unknown): DeclineDefinition {
  const o = (v ?? {}) as Record<string, unknown>;
  return { threshold: numIn(o.threshold, 0.05, 0.5, DEFAULT_DECLINE.threshold), highWindow: Math.round(numIn(o.highWindow, 20, 2520, DEFAULT_DECLINE.highWindow)) };
}

function rule(v: unknown): SignalRule {
  const o = (v ?? {}) as Record<string, unknown>;
  if (o.kind === 'regimes' && Array.isArray(o.regimes)) {
    const regimes = o.regimes.filter((r): r is Regime => REGIME_ORDER.includes(r as Regime));
    if (regimes.length) return { kind: 'regimes', regimes };
  }
  return { kind: 'score', min: numIn(o.min, 0, 100, 40) };
}

function filters(v: unknown): Partial<ScreenFilters> {
  const o = (v ?? {}) as Record<string, unknown>;
  const out: Partial<ScreenFilters> = {};
  const keys: [NumericFilterKey, number, number][] = [
    ['minPremium', 0, 100],
    ['maxPremium', 0, 500],
    ['minDte', 0, 1000],
    ['maxDte', 1, 1000],
    ['minAbsDelta', 0, 1],
    ['maxAbsDelta', 0, 1],
    ['minOpenInterest', 0, 1e7],
    ['minVolume', 0, 1e7],
    ['maxSpreadPct', 0, 5],
  ];
  for (const [k, lo, hi] of keys) if (typeof o[k] === 'number' && Number.isFinite(o[k])) out[k] = Math.max(lo, Math.min(hi, o[k] as number));
  return out;
}

function exits(v: unknown): Partial<ExitRules> {
  const o = (v ?? {}) as Record<string, unknown>;
  const out: Partial<ExitRules> = {};
  if ('profitTarget' in o) out.profitTarget = numOrNull(o.profitTarget, 0.05, 100);
  if ('maxLoss' in o) out.maxLoss = numOrNull(o.maxLoss, 0.05, 1);
  if ('underlyingTarget' in o) out.underlyingTarget = numOrNull(o.underlyingTarget, 0, 1e6);
  if ('vixAbove' in o) out.vixAbove = numOrNull(o.vixAbove, 5, 200);
  if ('onBreakdown' in o) out.onBreakdown = o.onBreakdown === true;
  if ('maxHoldDays' in o) out.maxHoldDays = numOrNull(o.maxHoldDays, 1, 1000);
  if ('manualExit' in o) out.manualExit = typeof o.manualExit === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.manualExit) ? o.manualExit : null;
  if ('exitDaysBeforeExpiry' in o) out.exitDaysBeforeExpiry = numOrNull(o.exitDaysBeforeExpiry, 0, 365);
  return out;
}

function model(v: unknown): Partial<TheoreticalModel> {
  const o = (v ?? {}) as Record<string, unknown>;
  const out: Partial<TheoreticalModel> = {};
  if (typeof o.atmFactor === 'number') out.atmFactor = numIn(o.atmFactor, 0.5, 1.5, THEORETICAL_MODEL.atmFactor);
  if (typeof o.skewPtsPer10Pct === 'number') out.skewPtsPer10Pct = numIn(o.skewPtsPer10Pct, 0, 30, THEORETICAL_MODEL.skewPtsPer10Pct);
  if (typeof o.spreadPct === 'number') out.spreadPct = numIn(o.spreadPct, 0, 0.5, THEORETICAL_MODEL.spreadPct);
  if (typeof o.useSkewIndex === 'boolean') out.useSkewIndex = o.useSkewIndex;
  return out;
}

const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });

/** GET /api/crash/history — data coverage, research windows, strategies, defaults. */
export async function GET(request: Request) {
  const limited = rateLimit(request, 'crash-history', { capacity: 30, perMinute: 20 });
  if (limited) return limited;
  try {
    const h = await getHistory(new URL(request.url).searchParams.get('refresh') === '1');
    return NextResponse.json({
      builtAt: h.builtAt,
      firstSession: h.sessions[0] ?? null,
      lastSession: h.sessions[h.sessions.length - 1] ?? null,
      sessions: h.sessions.length,
      series: Object.values(h.data.series).map((s) => ({ id: s.meta.id, label: s.meta.label, source: s.meta.source, first: s.kind === 'bars' ? s.bars[0]?.date ?? null : s.points[0]?.date ?? null, last: s.kind === 'bars' ? s.bars[s.bars.length - 1]?.date ?? null : s.points[s.points.length - 1]?.date ?? null, vintage: !!s.meta.vintage, revisable: !!s.meta.revisable, license: s.meta.license })),
      errors: h.data.errors,
      validation: h.validation,
      options: await optionsCoverage(SIM_SYMBOLS),
      windows: RESEARCH_WINDOWS.map((w) => ({ id: w.id, label: w.label, start: w.start, end: w.end, focus: w.focus, symbols: w.symbols })),
      strategies: STRATEGIES,
      defaults: { evaluate: DEFAULT_EVALUATE, model: THEORETICAL_MODEL },
    });
  } catch (e) {
    return fail(e);
  }
}

/** POST /api/crash/history — { action: replay | reveal | chain | trade | evaluate | lab, ... } */
export async function POST(request: Request) {
  const limited = rateLimit(request, 'crash-history', { capacity: 30, perMinute: 20 });
  if (limited) return limited;
  const text = await request.text();
  if (text.length > 50_000) return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text || '{}');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    switch (b.action) {
      case 'replay':
        return NextResponse.json(
          await replay({
            date: ymd(b.date, '2007-06-01'),
            mode: b.mode === 'open' ? 'open' : 'close',
            symbols: Array.isArray(b.symbols) ? b.symbols.map(sym).slice(0, 6) : ['SPY'],
            noHindsight: b.noHindsight !== false,
          }),
        );
      case 'reveal':
        return NextResponse.json(await reveal({ date: ymd(b.date, '2007-06-01'), symbols: Array.isArray(b.symbols) ? b.symbols.map(sym).slice(0, 6) : ['SPY'], sessionsAhead: Math.round(numIn(b.sessionsAhead, 20, 500, 250)), decline: decline(b.decline) }));
      case 'chain':
        return NextResponse.json(
          await historicalChain({
            symbol: sym(b.symbol),
            date: ymd(b.date, '2007-06-01'),
            horizon: b.horizon === 'long' || b.horizon === 'leaps' ? b.horizon : 'short',
            filters: filters(b.filters),
            theoretical: b.theoretical === true,
            model: model(b.model),
          }),
        );
      case 'scan':
        return NextResponse.json(
          await scanWindow({
            symbol: sym(b.symbol),
            from: ymd(b.from, '2007-01-03'),
            to: ymd(b.to, '2007-12-31'),
            horizon: b.horizon === 'long' || b.horizon === 'leaps' ? b.horizon : 'short',
            step: Math.round(numIn(b.step, 1, 60, 5)),
            theoretical: b.theoretical === true,
            model: model(b.model),
          }),
        );
      case 'trade': {
        const e = (b.entry ?? {}) as Record<string, unknown>;
        const p: TradeParams = {
          symbol: sym(b.symbol),
          date: ymd(b.date, '2007-06-01'),
          optionSymbol: String(b.optionSymbol ?? '').slice(0, 64),
          strike: numIn(b.strike, 0.5, 1e5, 100),
          expiration: ymd(b.expiration, '2007-07-20'),
          kind: b.kind === 'actual' ? 'actual' : 'theoretical',
          entry: { method: e.method === 'mid' || e.method === 'limit' || e.method === 'custom' ? e.method : 'ask', price: numOrNull(e.price, 0.01, 1e4) ?? undefined, limitDays: Math.round(numIn(e.limitDays, 1, 10, 1)) },
          exitFill: b.exitFill === 'mid' ? 'mid' : 'bid',
          contracts: Math.round(numIn(b.contracts, 1, 1000, 1)),
          feePerContract: numIn(b.feePerContract, 0, 20, 0.65),
          exits: exits(b.exits),
          model: model(b.model),
        };
        return NextResponse.json(await historicalTrade(p));
      }
      case 'evaluate': {
        const wf = (b.walkForward ?? {}) as Record<string, unknown>;
        const ev = (b.eval ?? {}) as Record<string, unknown>;
        return NextResponse.json(
          await evaluate({
            decline: decline(b.decline),
            rule: rule(b.rule),
            eval: {
              maxLeadDays: Math.round(numIn(ev.maxLeadDays, 10, 365, DEFAULT_EVAL.maxLeadDays)),
              minLeadDays: Math.round(numIn(ev.minLeadDays, 0, 120, DEFAULT_EVAL.minLeadDays)),
              horizonDays: Math.round(numIn(ev.horizonDays, 10, 365, DEFAULT_EVAL.horizonDays)),
              mergeGap: Math.round(numIn(ev.mergeGap, 0, 30, DEFAULT_EVAL.mergeGap)),
            },
            splitDate: ymd(b.splitDate, DEFAULT_EVALUATE.splitDate),
            walkForward: {
              candidates: Array.isArray(wf.candidates) ? wf.candidates.filter((x): x is number => typeof x === 'number' && x >= 0 && x <= 100).slice(0, 12) : DEFAULT_EVALUATE.walkForward.candidates,
              trainYears: numIn(wf.trainYears, 1, 15, DEFAULT_EVALUATE.walkForward.trainYears),
              testYears: numIn(wf.testYears, 0.5, 10, DEFAULT_EVALUATE.walkForward.testYears),
            },
            from: typeof b.from === 'string' ? ymd(b.from, '') || undefined : undefined,
            to: typeof b.to === 'string' ? ymd(b.to, '') || undefined : undefined,
          }),
        );
      }
      case 'lab': {
        const s = (b.settings ?? {}) as Record<string, unknown>;
        const ids = Array.isArray(b.strategies) ? b.strategies.filter((x): x is LabParams['strategies'][number] => ['A', 'B', 'C', 'D', 'E', 'F'].includes(x as string)) : ['A', 'B', 'C', 'D', 'E', 'F'];
        const ov = (b.overrides ?? {}) as Record<string, Record<string, unknown>>;
        const overrides: LabParams['overrides'] = {};
        for (const id of ids) {
          const o = ov[id];
          if (o) overrides[id as LabParams['strategies'][number]] = { entryMin: numOrNull(o.entryMin, 0, 100) ?? undefined, exits: exits(o.exits), filters: filters(o.filters) };
        }
        return NextResponse.json(
          await lab({
            settings: {
              symbol: sym(s.symbol),
              from: ymd(s.from, '2005-01-01'),
              to: ymd(s.to, '2099-12-31'),
              initialCapital: numIn(s.initialCapital, 100, 1e8, 10_000),
              riskPerTrade: numIn(s.riskPerTrade, 10, 1e7, 500),
              feePerContract: numIn(s.feePerContract, 0, 20, 0.65),
              entryMethod: s.entryMethod === 'mid' || s.entryMethod === 'limit' ? s.entryMethod : 'ask',
              exitFill: s.exitFill === 'mid' ? 'mid' : 'bid',
              splitDate: ymd(s.splitDate, '2016-01-01'),
            },
            strategies: ids as LabParams['strategies'],
            overrides,
            decline: decline(b.decline),
            preferTheoretical: b.preferTheoretical === true,
            model: model(b.model),
          }),
        );
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return fail(e);
  }
}
