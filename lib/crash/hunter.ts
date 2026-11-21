/**
 * Put Hunter scan: one underlying, one DTE window, every put evaluated,
 * then the passing ones scored for setup and ranked. Server-side because it
 * needs the Tradier token; the scoring itself is pure.
 */
import { equitySession } from '../marketData/session';
import { DIVIDEND_YIELD_ESTIMATE, FALLBACK_RISK_FREE, IV_SHOCKS, PRICE_SHOCKS, type ScreenFilters } from './config';
import { catalystsBefore, type Catalyst } from './catalysts';
import { atmIvByExpiration, evaluateContract, type EvaluatedContract } from './contracts';
import type { MarketView } from './market';
import { fetchPutChains } from './providers/chains';
import { etfBars } from './providers/fetchers';
import { runScenarios, smileFromChain, type ScenarioResult, type SmilePoint } from './scenarios';
import { addDays, realizedVol, type AnySeries, type MarketDataset } from './series';
import { LABEL_ORDER, evaluateSetup, type SetupResult } from './setup';

export interface HuntRow {
  ev: EvaluatedContract;
  setup: SetupResult;
  scenario: ScenarioResult | null;
  smile: SmilePoint[];
}

export interface HuntResult {
  symbol: string;
  underlyingPrice: number | null;
  underlyingQuoteTime: string | null;
  realizedVol20: number | null;
  riskFree: number;
  dividendYield: number;
  filters: ScreenFilters;
  scanned: number;
  passing: number;
  rows: HuntRow[];
  rejectedSample: { symbol: string; strike: number; expiration: string; reasons: string[] }[];
  rejectionCounts: Record<string, number>;
  noTrade: boolean;
  noTradeReason?: string;
  source: string;
  fetchedAt: string;
  error?: string;
  partialErrors: string[];
  expirationsScanned: string[];
}

/** How many passing contracts get a full scenario grid for ranking. */
const SCENARIO_TOP = 15;

function reasonKey(r: string): string {
  return r.replace(/[\d.$%]+/g, '#').replace(/\s+/g, ' ').trim();
}

export async function huntPuts(args: {
  symbol: string;
  filters: ScreenFilters;
  market: MarketView;
  data: MarketDataset;
  catalysts: Catalyst[];
  now?: Date;
}): Promise<HuntResult> {
  const now = args.now ?? new Date();
  const symbol = args.symbol.toUpperCase();
  const f = args.filters;
  const chain = await fetchPutChains(symbol, f.minDte, f.maxDte, now);
  const rLatest = args.data.series.DGS3MO;
  const rf = rLatest && rLatest.kind === 'level' && rLatest.points.length ? rLatest.points[rLatest.points.length - 1].value / 100 : FALLBACK_RISK_FREE;
  const q = DIVIDEND_YIELD_ESTIMATE[symbol] ?? 0;

  let bars: AnySeries | undefined = args.data.series[symbol];
  if (!bars) {
    try {
      bars = await etfBars(symbol, addDays(now.toISOString().slice(0, 10), -120));
    } catch {
      bars = undefined;
    }
  }
  const closes = bars && bars.kind === 'bars' ? bars.bars.map((b) => b.close) : [];
  const rv = realizedVol(closes, 20);

  const base: HuntResult = {
    symbol,
    underlyingPrice: chain.underlyingPrice,
    underlyingQuoteTime: chain.underlyingQuoteTime,
    realizedVol20: rv,
    riskFree: rf,
    dividendYield: q,
    filters: f,
    scanned: 0,
    passing: 0,
    rows: [],
    rejectedSample: [],
    rejectionCounts: {},
    noTrade: true,
    source: chain.source,
    fetchedAt: chain.fetchedAt,
    error: chain.error,
    partialErrors: chain.partialErrors,
    expirationsScanned: chain.expirationsScanned,
  };
  if (chain.error && !chain.contracts.length) return { ...base, noTradeReason: chain.error };
  const S = chain.underlyingPrice;
  if (S == null || !(S > 0)) return { ...base, error: base.error ?? `No live ${symbol} price from Tradier.`, noTradeReason: 'No underlying price' };

  const puts = chain.contracts.filter((c) => c.type === 'put');
  const atm = atmIvByExpiration(puts, S);
  const sessionOpen = equitySession(now).session === 'REGULAR';
  const smiles = new Map<string, SmilePoint[]>();
  for (const exp of Array.from(new Set(puts.map((p) => p.expiration)))) {
    smiles.set(exp, smileFromChain(puts.filter((p) => p.expiration === exp).map((p) => ({ strike: p.strike, iv: p.iv, type: 'put' as const })), S));
  }

  const evs = puts.map((c) => evaluateContract(c, { underlyingPrice: S, realizedVol20: rv, atmIv: atm.get(c.expiration) ?? null, sessionOpen, now }, f));
  const counts: Record<string, number> = {};
  for (const e of evs) for (const r of e.rejections) counts[reasonKey(r)] = (counts[reasonKey(r)] ?? 0) + 1;
  const passing = evs.filter((e) => e.passes);
  const today = now.toISOString().slice(0, 10);

  const prelim = passing
    .map((ev) => ({ ev, s: evaluateSetup({ marketScore: args.market.score.score, regime: args.market.regime.regime, facts: args.market.regime.facts, ev, catalystsBeforeExpiry: catalystsBefore(args.catalysts, ev.contract.expiration, today) }) }))
    .sort((a, b) => (b.s.setup ?? 0) - (a.s.setup ?? 0) || (b.ev.quality ?? 0) - (a.ev.quality ?? 0));

  const rows: HuntRow[] = prelim.map(({ ev, s }, i) => {
    const smile = smiles.get(ev.contract.expiration) ?? [];
    let scenario: ScenarioResult | null = null;
    let setup = s;
    if (i < SCENARIO_TOP && ev.contract.ask != null && ev.contract.iv != null) {
      scenario = runScenarios(
        { type: 'put', S, K: ev.contract.strike, dte: ev.contract.dte, entry: ev.contract.ask, mid: ev.mid, iv: ev.contract.iv, r: rf, q, smile, holdDays: Math.min(21, Math.round(ev.contract.dte / 2)), steps: 120 },
        PRICE_SHOCKS,
        IV_SHOCKS,
      );
      setup = evaluateSetup({ marketScore: args.market.score.score, regime: args.market.regime.regime, facts: args.market.regime.facts, ev, scenario, catalystsBeforeExpiry: catalystsBefore(args.catalysts, ev.contract.expiration, today) });
    }
    return { ev, setup, scenario, smile };
  });
  rows.sort((a, b) => LABEL_ORDER.indexOf(a.setup.label) - LABEL_ORDER.indexOf(b.setup.label) || (b.setup.setup ?? 0) - (a.setup.setup ?? 0));

  const actionable = rows.filter((r) => r.setup.label === 'STRONG WATCH' || r.setup.label === 'WATCH');
  return {
    ...base,
    scanned: puts.length,
    passing: passing.length,
    rows: rows.slice(0, 60),
    rejectedSample: evs.filter((e) => !e.passes).slice(0, 40).map((e) => ({ symbol: e.contract.symbol, strike: e.contract.strike, expiration: e.contract.expiration, reasons: e.rejections })),
    rejectionCounts: counts,
    noTrade: actionable.length === 0,
    noTradeReason: actionable.length
      ? undefined
      : passing.length === 0
        ? 'No contract passed the screening filters.'
        : `No contract reached WATCH: regime is ${args.market.regime.regime}${args.market.score.score != null ? `, risk score ${Math.round(args.market.score.score)}` : ''}.`,
  };
}
