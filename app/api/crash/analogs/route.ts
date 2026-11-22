import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { buildDataset } from '@/lib/crash/providers/dataset';
import { buildMarketView } from '@/lib/crash/market';
import { huntPuts } from '@/lib/crash/hunter';
import { getHistory } from '@/lib/crash/history/service';
import { VOL_INDEX } from '@/lib/crash/history/theoretical';
import { findAnalogs, historicalPayoff, learnBucket, type HistoricalPayoff } from '@/lib/crash/analogs';
import { LEAPS_FILTERS, LONG_TERM_FILTERS, SHORT_TERM_FILTERS, TAIL_FILTERS, type NumericFilterKey, type ScreenFilters } from '@/lib/crash/config';
import type { AnySeries } from '@/lib/crash/series';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const NUM_KEYS: NumericFilterKey[] = ['minPremium', 'maxPremium', 'minDte', 'maxDte', 'minAbsDelta', 'maxAbsDelta', 'minOpenInterest', 'minVolume', 'maxSpreadPct', 'maxGreeksAgeMin', 'maxSpreadAbs'];

function toMap(s: AnySeries | undefined): Map<string, number> | undefined {
  if (!s) return undefined;
  return s.kind === 'bars' ? new Map(s.bars.map((b) => [b.date, b.close])) : new Map(s.points.map((p) => [p.date, p.value]));
}

/**
 * GET /api/crash/analogs?symbol=SPY&horizon=short|long|leaps|tail[&filters…]
 * "Days like today" for the same scan Put Hunter shows, and each passing
 * contract re-priced on what followed those days (THEORETICAL re-pricing of
 * real past moves). Slow on a cold start because it loads the full history.
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, 'crash-analogs', { capacity: 10, perMinute: 6 });
  if (limited) return limited;
  const sp = new URL(request.url).searchParams;
  const symbol = (sp.get('symbol') ?? 'SPY').toUpperCase().trim();
  if (!SYMBOL_RE.test(symbol)) return NextResponse.json({ error: 'Enter a valid ticker symbol, like SPY or QQQ.' }, { status: 400 });
  const horizon = sp.get('horizon');
  const tail = horizon === 'tail';
  const filters: ScreenFilters = { ...(horizon === 'long' ? LONG_TERM_FILTERS : horizon === 'leaps' ? LEAPS_FILTERS : tail ? TAIL_FILTERS : SHORT_TERM_FILTERS) };
  for (const k of NUM_KEYS) {
    const v = sp.get(k);
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) filters[k] = n;
  }
  filters.maxDte = Math.min(filters.maxDte, 900);
  const holdSessions = tail ? 5 : horizon === 'leaps' || horizon === 'long' ? 20 : 10;

  try {
    const [history, data] = await Promise.all([getHistory(), buildDataset({ scope: 'live' })]);
    const market = await buildMarketView(data);
    const hunt = await huntPuts({ symbol, filters, market, data, catalysts: market.catalysts, mode: tail ? 'tail' : 'standard' });

    const ownCloses = toMap(history.data.series[symbol]);
    const volId = VOL_INDEX[symbol] ?? 'VIX';
    const ownVol = toMap(history.data.series[volId]);
    const useOwn = ownCloses && ownCloses.size > 1000;
    const today = { date: market.score.asOf ?? new Date().toISOString().slice(0, 10), score: market.score.score, vix: market.regime.facts.vix ?? null, regime: market.regime.regime };
    const analogs = findAnalogs({ tl: history.timeline, today, holdSessions, closes: useOwn ? ownCloses : undefined, vols: useOwn && ownVol && ownVol.size > 1000 ? ownVol : undefined });

    const payoffs: Record<string, HistoricalPayoff> = {};
    const S = hunt.underlyingPrice;
    if (S != null) {
      for (const row of hunt.rows) {
        const c = row.ev.contract;
        if (c.ask == null || c.iv == null) continue;
        const p = historicalPayoff({ S, K: c.strike, dte: c.dte, entry: c.ask, iv: c.iv, r: hunt.riskFree, q: hunt.dividendYield, analogs });
        if (p) payoffs[c.symbol] = p;
      }
    }
    const learned = learnBucket(hunt.rows.map((r) => ({ absDelta: Math.abs(r.ev.contract.delta ?? 0), dte: r.ev.contract.dte, payoff: payoffs[r.ev.contract.symbol] ?? null })));

    return NextResponse.json({
      symbol,
      horizon: horizon ?? 'short',
      underlyingSeries: useOwn ? symbol : 'SPY',
      volSeries: useOwn && ownVol && ownVol.size > 1000 ? volId : 'VIX',
      holdSessions,
      today,
      tolerance: analogs.tolerance,
      days: analogs.days.length,
      episodes: analogs.episodes,
      first: analogs.first,
      last: analogs.last,
      stats: analogs.stats,
      payoffs,
      learned,
      historyBuiltAt: history.builtAt,
      label: 'THEORETICAL',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
