/**
 * Strategy Comparison Lab: six put strategies run over the same history
 * with the same execution assumptions.
 *
 * Each strategy is an entry rule (on the point-in-time timeline), a contract
 * selection rule (Put Hunter filters plus a pick), and exit rules. One
 * position at a time per strategy; after an exit it waits `cooldownDays`
 * before it may enter again. Contracts come from an actual historical chain
 * when one is loaded for the date, otherwise the THEORETICAL model, and each
 * trade records which. No strategy is assumed to beat another.
 */
import { RESEARCH_SHORT_FILTERS as SHORT_TERM_FILTERS, type ScreenFilters } from '../config';
import { evaluateContract, atmIvByExpiration, type EvaluatedContract } from '../contracts';
import { realizedVol, PointInTime, addDays, type MarketDataset } from '../series';
import type { Regime } from '../regime';
import type { DeclineEvent } from './events';
import { isOn, type SignalRule } from './signals';
import type { TimelinePoint } from './timeline';
import { DEFAULT_EXITS, simulateTrade, type ContractPricer, type EntryMethod, type ExitRules, type TradeResult } from './trade';
import type { ChainSnapshot } from './pricers';

export type PickRule = 'quality' | 'cheapest' | 'targetDelta' | 'vegaPerPremium';

export interface StrategyDef {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  name: string;
  about: string;
  entry: SignalRule;
  filters: ScreenFilters;
  pick: PickRule;
  targetDelta?: number;
  exits: ExitRules;
  cooldownDays: number;
}

const liquidityOff = { minOpenInterest: 0, minVolume: 0 };

export const STRATEGIES: StrategyDef[] = [
  {
    id: 'A',
    name: 'Cheap OTM puts',
    about: 'Low-premium puts ($0.05–$0.50, 14–60 DTE). Little capital, high chance of expiring worthless.',
    entry: { kind: 'score', min: 40 },
    filters: { ...SHORT_TERM_FILTERS },
    pick: 'quality',
    exits: { ...DEFAULT_EXITS },
    cooldownDays: 20,
  },
  {
    id: 'B',
    name: 'Moderate-delta puts',
    about: '|Delta| 0.30–0.45, 30–60 DTE. More directional sensitivity, more premium up front.',
    entry: { kind: 'score', min: 40 },
    filters: { ...SHORT_TERM_FILTERS, minPremium: 0.05, maxPremium: 50, minDte: 30, maxDte: 60, minAbsDelta: 0.3, maxAbsDelta: 0.45 },
    pick: 'targetDelta',
    targetDelta: 0.35,
    exits: { ...DEFAULT_EXITS, profitTarget: 1 },
    cooldownDays: 20,
  },
  {
    id: 'C',
    name: 'Longer-dated puts',
    about: '90–180 DTE, |delta| 0.20–0.35. More time for the thesis, more capital.',
    entry: { kind: 'score', min: 40 },
    filters: { ...SHORT_TERM_FILTERS, minPremium: 0.05, maxPremium: 50, minDte: 90, maxDte: 180, minAbsDelta: 0.2, maxAbsDelta: 0.35 },
    pick: 'targetDelta',
    targetDelta: 0.25,
    exits: { ...DEFAULT_EXITS, profitTarget: 1.5, exitDaysBeforeExpiry: 30 },
    cooldownDays: 20,
  },
  {
    id: 'D',
    name: 'Volatility expansion',
    about: 'Most vega per dollar of premium, 45–120 DTE; exits when VIX reaches 30.',
    entry: { kind: 'score', min: 40 },
    filters: { ...SHORT_TERM_FILTERS, minPremium: 0.05, maxPremium: 50, minDte: 45, maxDte: 120, minAbsDelta: 0.15, maxAbsDelta: 0.35 },
    pick: 'vegaPerPremium',
    exits: { ...DEFAULT_EXITS, vixAbove: 30 },
    cooldownDays: 20,
  },
  {
    id: 'E',
    name: 'Breakdown confirmation',
    about: 'Waits for BREAKDOWN CONFIRMED before entering; 21–60 DTE.',
    entry: { kind: 'regimes', regimes: ['BREAKDOWN CONFIRMED'] },
    filters: { ...SHORT_TERM_FILTERS, maxPremium: 5, minDte: 21, maxDte: 60 },
    pick: 'quality',
    exits: { ...DEFAULT_EXITS },
    cooldownDays: 20,
  },
  {
    id: 'F',
    name: 'Early warning',
    about: 'Enters on PRE-CRASH WATCH: several independent categories deteriorating while volatility is subdued; 45–120 DTE.',
    entry: { kind: 'regimes', regimes: ['PRE-CRASH WATCH'] },
    filters: { ...SHORT_TERM_FILTERS, maxPremium: 5, minDte: 45, maxDte: 120, minAbsDelta: 0.15, maxAbsDelta: 0.35 },
    pick: 'quality',
    exits: { ...DEFAULT_EXITS },
    cooldownDays: 20,
  },
];

export interface LabSettings {
  symbol: string;
  from: string;
  to: string;
  initialCapital: number;
  /** Most premium (plus fees) committed to one trade. */
  riskPerTrade: number;
  feePerContract: number;
  entryMethod: EntryMethod;
  exitFill: 'bid' | 'mid';
  /** Out-of-sample boundary for the split report. */
  splitDate: string;
}

export const DEFAULT_LAB: LabSettings = {
  symbol: 'SPY',
  from: '2005-01-01',
  to: '2099-12-31',
  initialCapital: 10_000,
  riskPerTrade: 500,
  feePerContract: 0.65,
  entryMethod: 'ask',
  exitFill: 'bid',
  splitDate: '2016-01-01',
};

export interface LabTrade {
  strategy: StrategyDef['id'];
  signalDate: string;
  regimeAtEntry: Regime | null;
  scoreAtEntry: number | null;
  contract: { symbol: string; strike: number; expiration: string; dte: number; delta: number | null; ask: number | null; quality: number | null };
  result: TradeResult;
}

export interface PeriodStats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPremium: number;
  net: number;
  avgWinPct: number | null;
  avgLossPct: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  maxConsecutiveLosses: number;
  avgHoldDays: number | null;
}

export interface StrategyReport {
  def: StrategyDef;
  trades: LabTrade[];
  skipped: { date: string; reason: string }[];
  kinds: { actual: number; theoretical: number };
  stats: PeriodStats & { maxDrawdown: number; endingEquity: number };
  inSample: PeriodStats;
  outOfSample: PeriodStats;
  byRegime: Record<string, { trades: number; net: number }>;
  byYear: Record<string, { trades: number; net: number }>;
  equity: { date: string; equity: number }[];
  /** Declines in range with no trade open or entered from the lead window to the trough. */
  missedDeclines: string[];
  capturedDeclines: string[];
}

export type ChainProvider = (symbol: string, date: string, minDte: number, maxDte: number) => ChainSnapshot | { error: string };
export type PricerProvider = (snap: ChainSnapshot, ev: EvaluatedContract) => ContractPricer;

function periodStats(trades: LabTrade[]): PeriodStats {
  const done = trades.filter((t) => t.result.filled && t.result.net != null);
  const wins = done.filter((t) => (t.result.net as number) > 0);
  const losses = done.filter((t) => (t.result.net as number) <= 0);
  const sumW = wins.reduce((a, t) => a + (t.result.net as number), 0);
  const sumL = losses.reduce((a, t) => a + (t.result.net as number), 0);
  let streak = 0;
  let worst = 0;
  for (const t of done) {
    if ((t.result.net as number) <= 0) worst = Math.max(worst, ++streak);
    else streak = 0;
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    trades: done.length,
    wins: wins.length,
    losses: losses.length,
    winRate: done.length ? wins.length / done.length : null,
    totalPremium: done.reduce((a, t) => a + (t.result.capital ?? 0), 0),
    net: sumW + sumL,
    avgWinPct: avg(wins.map((t) => t.result.returnPct as number)),
    avgLossPct: avg(losses.map((t) => t.result.returnPct as number)),
    // null when there were no losing trades (undefined ratio).
    profitFactor: sumL < 0 ? sumW / -sumL : null,
    expectancy: done.length ? (sumW + sumL) / done.length : null,
    maxConsecutiveLosses: worst,
    avgHoldDays: avg(done.map((t) => t.result.holdingDays ?? 0)),
  };
}

function pickContract(evs: EvaluatedContract[], s: StrategyDef): EvaluatedContract | null {
  const ok = evs.filter((e) => e.passes && e.contract.ask != null && e.contract.ask > 0);
  if (!ok.length) return null;
  const by = (k: (e: EvaluatedContract) => number) => ok.reduce((a, b) => (k(b) > k(a) ? b : a));
  switch (s.pick) {
    case 'cheapest':
      return by((e) => -(e.contract.ask as number));
    case 'targetDelta':
      return by((e) => -Math.abs(Math.abs(e.contract.delta ?? 0) - (s.targetDelta ?? 0.3)));
    case 'vegaPerPremium':
      return by((e) => e.vegaPerPremium ?? -1);
    default:
      return by((e) => (e.quality ?? 0) + 1e-3 * (e.vegaPerPremium ?? 0));
  }
}

export function runStrategy(args: {
  def: StrategyDef;
  settings: LabSettings;
  data: MarketDataset;
  timeline: TimelinePoint[];
  events: DeclineEvent[];
  sessions: string[];
  chain: ChainProvider;
  pricer: PricerProvider;
  maxLeadDays?: number;
}): StrategyReport {
  const { def, settings: st, timeline } = args;
  const tlByDate = new Map(timeline.map((p) => [p.date, p]));
  const trades: LabTrade[] = [];
  const skipped: { date: string; reason: string }[] = [];
  let nextAllowed = '';
  const filters = { ...def.filters };
  for (const p of timeline) {
    if (p.date < st.from || p.date > st.to || p.date < nextAllowed) continue;
    if (!isOn(p, def.entry)) continue;
    const snap = args.chain(st.symbol, p.date, filters.minDte, filters.maxDte);
    if ('error' in snap) {
      skipped.push({ date: p.date, reason: snap.error });
      nextAllowed = addDays(p.date, 5);
      continue;
    }
    const f = snap.kind === 'theoretical' ? { ...filters, ...liquidityOff } : filters;
    const closes = new PointInTime(args.data, p.date, 'close').closes(st.symbol);
    const rv = realizedVol(closes, 20);
    const atm = atmIvByExpiration(snap.contracts, snap.S);
    const evs = snap.contracts.map((c) => evaluateContract(c, { underlyingPrice: snap.S, realizedVol20: rv, atmIv: atm.get(c.expiration) ?? null, sessionOpen: false, now: new Date(`${p.date}T20:00:00Z`) }, f));
    const pick = pickContract(evs, def);
    if (!pick) {
      skipped.push({ date: p.date, reason: 'No contract passed the filters' });
      nextAllowed = addDays(p.date, 5);
      continue;
    }
    const perContract = (pick.contract.ask as number) * 100 + st.feePerContract;
    const n = Math.floor(st.riskPerTrade / perContract);
    if (n < 1) {
      skipped.push({ date: p.date, reason: `One contract ($${perContract.toFixed(0)}) exceeds the $${st.riskPerTrade} risk per trade` });
      nextAllowed = addDays(p.date, 5);
      continue;
    }
    const idx = args.sessions.indexOf(p.date);
    const result = simulateTrade({
      pricer: args.pricer(snap, pick),
      sessions: args.sessions.slice(idx),
      entry: { method: st.entryMethod, limitDays: 3 },
      exitFill: st.exitFill,
      contracts: n,
      feePerContract: st.feePerContract,
      exits: def.exits,
      context: (d) => {
        const t = tlByDate.get(d);
        return t ? { regime: t.insufficient ? null : t.regime, vix: t.vix } : null;
      },
    });
    trades.push({
      strategy: def.id,
      signalDate: p.date,
      regimeAtEntry: p.insufficient ? null : p.regime,
      scoreAtEntry: p.score,
      contract: { symbol: pick.contract.symbol, strike: pick.contract.strike, expiration: pick.contract.expiration, dte: pick.contract.dte, delta: pick.contract.delta, ask: pick.contract.ask, quality: pick.quality },
      result,
    });
    nextAllowed = addDays(result.exitDate ?? p.date, def.cooldownDays);
  }

  // Equity curve on realized P/L, marked at each exit date.
  let eq = st.initialCapital;
  let peak = eq;
  let maxDD = 0;
  const equity: { date: string; equity: number }[] = [{ date: st.from, equity: eq }];
  for (const t of [...trades].filter((x) => x.result.filled).sort((a, b) => ((a.result.exitDate ?? '') < (b.result.exitDate ?? '') ? -1 : 1))) {
    eq += t.result.net ?? 0;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak > 0 ? (peak - eq) / peak : 0);
    equity.push({ date: t.result.exitDate as string, equity: eq });
  }
  const byRegime: Record<string, { trades: number; net: number }> = {};
  const byYear: Record<string, { trades: number; net: number }> = {};
  for (const t of trades.filter((x) => x.result.filled)) {
    const r = t.regimeAtEntry ?? 'Insufficient data';
    byRegime[r] = { trades: (byRegime[r]?.trades ?? 0) + 1, net: (byRegime[r]?.net ?? 0) + (t.result.net ?? 0) };
    const y = t.signalDate.slice(0, 4);
    byYear[y] = { trades: (byYear[y]?.trades ?? 0) + 1, net: (byYear[y]?.net ?? 0) + (t.result.net ?? 0) };
  }
  const lead = args.maxLeadDays ?? 120;
  const missed: string[] = [];
  const captured: string[] = [];
  for (const e of args.events.filter((x) => x.crossDate >= st.from && x.crossDate <= st.to)) {
    const winStart = addDays(e.crossDate, -lead);
    const hit = trades.some((t) => t.result.filled && (t.result.entryDate as string) <= e.troughDate && (t.result.exitDate as string) >= winStart);
    (hit ? captured : missed).push(e.crossDate);
  }
  const all = periodStats(trades);
  return {
    def,
    trades,
    skipped: skipped.slice(0, 200),
    kinds: { actual: trades.filter((t) => t.result.kind === 'actual').length, theoretical: trades.filter((t) => t.result.kind === 'theoretical').length },
    stats: { ...all, maxDrawdown: maxDD, endingEquity: eq },
    inSample: periodStats(trades.filter((t) => t.signalDate < st.splitDate)),
    outOfSample: periodStats(trades.filter((t) => t.signalDate >= st.splitDate)),
    byRegime,
    byYear,
    equity,
    missedDeclines: missed,
    capturedDeclines: captured,
  };
}
