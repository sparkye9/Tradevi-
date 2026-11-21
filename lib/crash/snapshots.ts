/**
 * Daily put-chain recorder. Saves an end-of-day snapshot of SPY / QQQ / IWM /
 * DIA puts from Tradier into Supabase (table crash_option_snapshots, see
 * supabase/schema.sql) so Tradevi builds a genuine historical options record
 * from today onward. Run by Vercel Cron via /api/crash/snapshot.
 */
import { fetchChain, fetchTradierQuotes, getToken, tradierGet } from '../tradier';
import { toContract } from './providers/chains';
import { settleLimited } from './providers/fetchers';
import { daysToExpiry } from './pricing';
import type { PutContract } from './contracts';

export const SNAPSHOT_UNDERLYINGS = ['SPY', 'QQQ', 'IWM', 'DIA'];
export const SNAPSHOT_MIN_DTE = 7;
/** Every expiration up to this DTE is recorded… */
export const SNAPSHOT_FULL_DTE = 130;
/** …and beyond it only monthly (third-Friday) expirations up to this. */
export const SNAPSHOT_MAX_DTE = 800;

export interface SnapshotRow {
  trade_date: string;
  captured_at: string;
  underlying: string;
  underlying_price: number | null;
  option_symbol: string;
  option_type: 'put' | 'call';
  expiration: string;
  strike: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number | null;
  open_interest: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  greeks_updated_at: string | null;
  source: string;
}

function isMonthly(ymd: string): boolean {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.getUTCDay() === 5 && d.getUTCDate() >= 15 && d.getUTCDate() <= 21;
}

export function toRow(c: PutContract, tradeDate: string, capturedAt: string, S: number | null): SnapshotRow {
  return {
    trade_date: tradeDate,
    captured_at: capturedAt,
    underlying: c.underlying,
    underlying_price: S,
    option_symbol: c.symbol,
    option_type: c.type,
    expiration: c.expiration,
    strike: c.strike,
    bid: c.bid,
    ask: c.ask,
    last: c.last,
    volume: c.volume,
    open_interest: c.openInterest,
    delta: c.delta,
    gamma: c.gamma,
    theta: c.theta,
    vega: c.vega,
    iv: c.iv,
    greeks_updated_at: c.greeksUpdatedAt,
    source: c.source,
  };
}

export async function collectSnapshot(tradeDate: string, now: Date = new Date()): Promise<{ rows: SnapshotRow[]; errors: string[] }> {
  const token = getToken();
  if (!token) return { rows: [], errors: ['TRADIER_TOKEN is not set'] };
  const capturedAt = now.toISOString();
  const errors: string[] = [];
  const rows: SnapshotRow[] = [];
  const quotes = await fetchTradierQuotes(SNAPSHOT_UNDERLYINGS);
  const price = new Map(quotes.quotes.map((q) => [q.symbol, q.price]));
  for (const sym of SNAPSHOT_UNDERLYINGS) {
    let exps: string[] = [];
    try {
      const e = await tradierGet<{ expirations: { date: string[] | string } | null }>(`/markets/options/expirations?symbol=${sym}`, token);
      const raw = e.expirations?.date ?? [];
      exps = (Array.isArray(raw) ? raw : [raw]).filter((d) => {
        const dte = daysToExpiry(d, now);
        return dte >= SNAPSHOT_MIN_DTE && (dte <= SNAPSHOT_FULL_DTE || (dte <= SNAPSHOT_MAX_DTE && isMonthly(d)));
      });
    } catch (err) {
      errors.push(`${sym} expirations: ${String(err)}`);
      continue;
    }
    const res = await settleLimited(exps.map((d) => () => fetchChain(sym, d, token)), 4);
    res.forEach((r, i) => {
      if (r.status === 'rejected') {
        errors.push(`${sym} ${exps[i]}: ${String(r.reason)}`);
        return;
      }
      for (const o of r.value) {
        if (o.option_type !== 'put') continue;
        const c = toContract(o, sym, now);
        const ad = c.delta == null ? null : Math.abs(c.delta);
        if (ad != null && (ad < 0.01 || ad > 0.7)) continue; // far wings / deep ITM add bulk, not research value
        rows.push(toRow(c, tradeDate, capturedAt, price.get(sym) ?? null));
      }
    });
  }
  return { rows, errors };
}
