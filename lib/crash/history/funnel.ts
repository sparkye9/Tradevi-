/**
 * Historical Put Hunter replay: what Put Hunter would have shown on a past
 * date, stage by stage, using the same contract evaluation and setup
 * scoring as the live scanner.
 *
 * Works on either an actual historical chain (imported, licensed data or
 * Tradevi's own daily snapshots) or the THEORETICAL reconstruction. For a
 * theoretical chain, open interest and volume are unknown, so the liquidity
 * stage can only check the assumed quote; that is stated in the result.
 */
import { IV_SHOCKS, PRICE_SHOCKS, type ScreenFilters } from '../config';
import { atmIvByExpiration, evaluateContract, type EvaluatedContract, type PutContract } from '../contracts';
import type { Regime, RegimeFacts } from '../regime';
import { runScenarios, smileFromChain, type ScenarioResult, type SmilePoint } from '../scenarios';
import { LABEL_ORDER, evaluateSetup, stressReturn, type SetupResult } from '../setup';

export type ChainKind = 'actual' | 'theoretical';

export interface FunnelRow {
  ev: EvaluatedContract;
  setup: SetupResult;
  scenario: ScenarioResult | null;
}

export interface FunnelStage {
  id: 'scanned' | 'premium' | 'greeks' | 'liquidity' | 'quality' | 'aligned';
  label: string;
  count: number;
  note?: string;
}

export interface FunnelPicks {
  cheapest: string | null;
  highestQuality: string | null;
  highestVega: string | null;
  highestGamma: string | null;
  bestLiquidity: string | null;
  lowestTheta: string | null;
  bestScenario: string | null;
}

export interface FunnelResult {
  kind: ChainKind;
  date: string;
  symbol: string;
  underlyingPrice: number;
  filters: ScreenFilters;
  stages: FunnelStage[];
  rejectionCounts: Record<string, number>;
  rows: FunnelRow[];
  picks: FunnelPicks;
  /** Checks that could not be applied to this chain. */
  unchecked: string[];
}

const stageOf = (r: string): FunnelStage['id'] => {
  if (r.startsWith('Premium') || /DTE outside/.test(r)) return 'premium';
  if (r.startsWith('|Delta|') || r.startsWith('Incomplete Greeks') || r.startsWith('Stale Greeks')) return 'greeks';
  return 'liquidity';
};

const reasonKey = (r: string) => r.replace(/[\d.$%]+/g, '#').replace(/\s+/g, ' ').trim();

export function historicalHunt(args: {
  kind: ChainKind;
  date: string;
  symbol: string;
  contracts: PutContract[];
  S: number;
  realizedVol20: number | null;
  r: number;
  q: number;
  filters: ScreenFilters;
  market: { score: number | null; regime: Regime; facts: RegimeFacts };
  catalystsBefore: (expiration: string) => number;
  /** Model smile per expiration (theoretical chains), else built from the chain. */
  smileFor?: (dte: number) => SmilePoint[];
  scenarioTop?: number;
}): FunnelResult {
  const f: ScreenFilters = args.kind === 'theoretical' ? { ...args.filters, minOpenInterest: 0, minVolume: 0 } : args.filters;
  const now = new Date(`${args.date}T20:00:00Z`);
  const atm = atmIvByExpiration(args.contracts, args.S);
  const evs = args.contracts.map((c) =>
    evaluateContract(c, { underlyingPrice: args.S, realizedVol20: args.realizedVol20, atmIv: atm.get(c.expiration) ?? null, sessionOpen: false, now }, f),
  );
  const counts: Record<string, number> = {};
  const failedAt = new Map<EvaluatedContract, Set<string>>();
  for (const e of evs) {
    const st = new Set<string>();
    for (const r of e.rejections) {
      counts[reasonKey(r)] = (counts[reasonKey(r)] ?? 0) + 1;
      st.add(stageOf(r));
    }
    failedAt.set(e, st);
  }
  const passPremium = evs.filter((e) => !failedAt.get(e)!.has('premium'));
  const passGreeks = passPremium.filter((e) => !failedAt.get(e)!.has('greeks'));
  const passLiquidity = passGreeks.filter((e) => e.passes);
  const passQuality = passLiquidity.filter((e) => (e.quality ?? 0) >= 40);

  const smiles = new Map<string, SmilePoint[]>();
  const smileOf = (c: PutContract) => {
    if (!smiles.has(c.expiration)) {
      smiles.set(
        c.expiration,
        args.smileFor ? args.smileFor(c.dte) : smileFromChain(args.contracts.filter((x) => x.expiration === c.expiration).map((x) => ({ strike: x.strike, iv: x.iv, type: 'put' as const })), args.S),
      );
    }
    return smiles.get(c.expiration)!;
  };
  const setupOf = (ev: EvaluatedContract, scenario: ScenarioResult | null) =>
    evaluateSetup({ marketScore: args.market.score, regime: args.market.regime, facts: args.market.facts, ev, scenario, catalystsBeforeExpiry: args.catalystsBefore(ev.contract.expiration) });

  const prelim = passLiquidity
    .map((ev) => ({ ev, s: setupOf(ev, null) }))
    .sort((a, b) => (b.s.setup ?? 0) - (a.s.setup ?? 0) || (b.ev.quality ?? 0) - (a.ev.quality ?? 0));
  const top = args.scenarioTop ?? 12;
  const rows: FunnelRow[] = prelim.map(({ ev, s }, i) => {
    if (i >= top || ev.contract.ask == null || ev.contract.iv == null) return { ev, setup: s, scenario: null };
    const scenario = runScenarios(
      { type: 'put', S: args.S, K: ev.contract.strike, dte: ev.contract.dte, entry: ev.contract.ask, mid: ev.mid, iv: ev.contract.iv, r: args.r, q: args.q, smile: smileOf(ev.contract), holdDays: Math.min(21, Math.round(ev.contract.dte / 2)), steps: 80 },
      PRICE_SHOCKS,
      IV_SHOCKS,
    );
    return { ev, setup: setupOf(ev, scenario), scenario };
  });
  rows.sort((a, b) => LABEL_ORDER.indexOf(a.setup.label) - LABEL_ORDER.indexOf(b.setup.label) || (b.setup.setup ?? 0) - (a.setup.setup ?? 0));
  const aligned = rows.filter((r) => r.setup.label === 'STRONG WATCH' || r.setup.label === 'WATCH');

  const best = (list: FunnelRow[], key: (r: FunnelRow) => number | null, dir: 1 | -1): string | null => {
    let out: FunnelRow | null = null;
    let bv = 0;
    for (const r of list) {
      const v = key(r);
      if (v == null || !Number.isFinite(v)) continue;
      if (!out || v * dir > bv * dir) {
        out = r;
        bv = v;
      }
    }
    return out ? out.ev.contract.symbol : null;
  };
  const theo = args.kind === 'theoretical';
  const picks: FunnelPicks = {
    cheapest: best(rows, (r) => r.ev.contract.ask, -1),
    highestQuality: best(rows, (r) => r.ev.quality, 1),
    highestVega: best(rows, (r) => r.ev.contract.vega, 1),
    highestGamma: best(rows, (r) => r.ev.contract.gamma, 1),
    bestLiquidity: theo ? null : best(rows, (r) => (r.ev.contract.openInterest ?? 0) * (1 - (r.ev.spreadPct ?? 1)), 1),
    lowestTheta: best(rows, (r) => r.ev.thetaPctPerDay, -1),
    bestScenario: best(rows, (r) => stressReturn(r.scenario), 1),
  };

  return {
    kind: args.kind,
    date: args.date,
    symbol: args.symbol,
    underlyingPrice: args.S,
    filters: f,
    stages: [
      { id: 'scanned', label: 'Puts scanned', count: evs.length },
      { id: 'premium', label: 'Passed premium and DTE', count: passPremium.length },
      { id: 'greeks', label: 'Passed Greeks (delta, IV)', count: passGreeks.length },
      {
        id: 'liquidity',
        label: 'Passed liquidity',
        count: passLiquidity.length,
        note: theo ? 'Theoretical chain: only the assumed quote is checked; open interest and volume are unknown.' : undefined,
      },
      { id: 'quality', label: 'Contract quality ≥ 40', count: passQuality.length },
      { id: 'aligned', label: 'Aligned with market risk (WATCH or better)', count: aligned.length },
    ],
    rejectionCounts: counts,
    rows: rows.slice(0, 40),
    picks,
    unchecked: theo ? ['Open interest', 'Daily volume', 'Actual bid/ask (spread is assumed)', 'Vendor Greeks (model Greeks shown)'] : [],
  };
}
