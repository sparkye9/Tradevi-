/**
 * Chain sources and contract pricers for the simulator. One interface, two
 * implementations, so licensed historical data can be added without
 * touching the simulator:
 *  - actual: normalized rows from the historical options importer
 *    (ORATS, HistoricalOptionData.com, Cboe DataShop, Tradevi snapshots);
 *  - theoretical: the disclosed model in theoretical.ts.
 * Nothing silently substitutes one for the other: every chain and trade
 * carries its kind, and the simulator labels theoretical results.
 */
import type { PutContract } from '../contracts';
import { blackScholes } from '../pricing';
import type { MarketDataset } from '../series';
import type { HistoricalOptionRow } from './optionsImport';
import { THEORETICAL_MODEL, assumedQuote, theoreticalChain, theoreticalContext, theoreticalValue, type TheoreticalModel } from './theoretical';
import type { ContractPricer, Quote } from './trade';

export interface ChainSnapshot {
  kind: 'actual' | 'theoretical';
  date: string;
  symbol: string;
  S: number;
  r: number;
  q: number;
  contracts: PutContract[];
  source: string;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function theoreticalSnapshot(data: MarketDataset, symbol: string, date: string, minDte: number, maxDte: number, model: TheoreticalModel = THEORETICAL_MODEL): ChainSnapshot | { error: string } {
  const ctx = theoreticalContext(data, symbol, date, model);
  if ('error' in ctx) return ctx;
  return { kind: 'theoretical', date, symbol, S: ctx.S, r: ctx.r, q: ctx.q, contracts: theoreticalChain(ctx, minDte, maxDte), source: `THEORETICAL: ${ctx.atmSource}, skew ${model.skewPtsPer10Pct} pts / 10% OTM` };
}

export function theoreticalPricer(data: MarketDataset, symbol: string, strike: number, expiration: string, model: TheoreticalModel = THEORETICAL_MODEL): ContractPricer {
  const cache = new Map<string, Quote | null>();
  return {
    kind: 'theoretical',
    symbol,
    strike,
    expiration,
    quote(date: string) {
      if (cache.has(date)) return cache.get(date)!;
      const ctx = theoreticalContext(data, symbol, date, model);
      let out: Quote | null = null;
      if (!('error' in ctx)) {
        const dte = dayDiff(date, expiration);
        if (dte <= 0) {
          const v = Math.max(strike - ctx.S, 0);
          out = { date, S: ctx.S, bid: v, ask: v, mid: v, iv: null };
        } else {
          const { value, iv } = theoreticalValue(ctx, strike, ctx.S, dte);
          const g = blackScholes({ type: 'put', S: ctx.S, K: strike, T: dte / 365, r: ctx.r, q: ctx.q, sigma: iv });
          const qte = assumedQuote(ctx, value);
          out = { date, S: ctx.S, bid: qte.bid, ask: qte.ask, mid: (qte.bid + qte.ask) / 2, iv, delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega };
        }
      }
      cache.set(date, out);
      return out;
    },
  };
}

/** Rows grouped by trade date for one underlying. */
export interface ActualChainStore {
  symbol: string;
  source: string;
  byDate: Map<string, HistoricalOptionRow[]>;
}

export function toPutContract(r: HistoricalOptionRow, date: string): PutContract {
  return {
    symbol: r.optionSymbol,
    underlying: r.underlying,
    type: r.type,
    strike: r.strike,
    expiration: r.expiration,
    dte: dayDiff(date, r.expiration),
    bid: r.bid,
    ask: r.ask,
    last: r.last,
    volume: r.volume,
    openInterest: r.openInterest,
    delta: r.delta,
    gamma: r.gamma,
    theta: r.theta,
    vega: r.vega,
    iv: r.iv,
    greeksUpdatedAt: null,
    source: r.source,
  };
}

export function actualSnapshot(store: ActualChainStore, date: string, minDte: number, maxDte: number, r: number, q: number): ChainSnapshot | null {
  const rows = store.byDate.get(date);
  if (!rows || !rows.length) return null;
  const S = rows.find((x) => x.underlyingPrice != null)?.underlyingPrice;
  if (S == null) return null;
  const contracts = rows
    .filter((x) => x.type === 'put')
    .map((x) => toPutContract(x, date))
    .filter((c) => c.dte >= minDte && c.dte <= maxDte);
  return { kind: 'actual', date, symbol: store.symbol, S, r, q, contracts, source: store.source };
}

export function actualPricer(store: ActualChainStore, optionSymbol: string, strike: number, expiration: string): ContractPricer {
  return {
    kind: 'actual',
    symbol: store.symbol,
    strike,
    expiration,
    quote(date: string) {
      const row = store.byDate.get(date)?.find((x) => x.optionSymbol === optionSymbol);
      if (!row || row.bid == null || row.ask == null || row.underlyingPrice == null) return null;
      return { date, S: row.underlyingPrice, bid: row.bid, ask: row.ask, mid: (row.bid + row.ask) / 2, iv: row.iv, delta: row.delta, gamma: row.gamma, theta: row.theta, vega: row.vega };
    },
  };
}
