import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { buildDataset } from '@/lib/crash/providers/dataset';
import { buildMarketView } from '@/lib/crash/market';
import { huntPuts } from '@/lib/crash/hunter';
import { etfBars } from '@/lib/crash/providers/fetchers';
import { getHistory } from '@/lib/crash/history/service';
import { SMALL_ACCOUNT_SYMBOLS, smallAccountFilters } from '@/lib/crash/config';
import { addDays, type Bar } from '@/lib/crash/series';
import { beta, bestIntrinsicOnPath, currentFall, findEpisodes, fromHere, putAtExpiry, worseThanEver } from '@/lib/crash/trajectory';

export const runtime = 'nodejs';
export const maxDuration = 300;

export interface SmallRow {
  symbol: string;
  underlying: string;
  strike: number;
  expiration: string;
  dte: number;
  ask: number;
  bid: number;
  cost: number;
  contracts: number;
  delta: number | null;
  iv: number | null;
  openInterest: number | null;
  thin: boolean;
  /** Fall the fund needs by expiration to break even (positive, e.g. 0.023). */
  fundDrop: number | null;
  beta: number | null;
  /** The same, expressed as an SPY fall using the fund's beta. */
  spyDrop: number | null;
  chanceWorthless: number | null;
  price: number;
  /** Multiples of the price paid at expiration, and the best intrinsic value on the way. */
  paths: { id: 'median' | 'worstPast' | 'worseThanEver'; atExpiry: number; best: number }[];
}

const pathsDownsample = (p: number[], max = 400) => p.slice(0, max + 1).map((x) => Math.round(x * 10000) / 10000);

/**
 * GET /api/crash/small-account?budget=50
 * Puts that cost no more than the budget per contract across index and
 * cheaper sector/bond funds, plus where today's fall sits next to past
 * crashes and what history (and a worse-than-ever stress scenario) says next.
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, 'crash-small', { capacity: 8, perMinute: 4 });
  if (limited) return limited;
  const sp = new URL(request.url).searchParams;
  const budget = Math.max(5, Math.min(500, Number(sp.get('budget') ?? 50) || 50));
  const filters = smallAccountFilters(budget);
  const now = new Date();
  const from = addDays(now.toISOString().slice(0, 10), -400);

  try {
    const [history, data] = await Promise.all([getHistory(), buildDataset({ scope: 'live' })]);
    const market = await buildMarketView(data);
    const spySeries = history.data.series.SPY;
    const spyBars: Bar[] = spySeries && spySeries.kind === 'bars' ? spySeries.bars : [];

    const spyRecent = await etfBars('SPY', from).then((s) => s.bars).catch(() => [] as Bar[]);
    const scans = await Promise.all(
      SMALL_ACCOUNT_SYMBOLS.map(async (sym) => {
        const [hunt, bars] = await Promise.all([
          huntPuts({ symbol: sym, filters, market, data, catalysts: market.catalysts, mode: 'tail' }).catch((e) => ({ failed: e instanceof Error ? e.message : String(e) }) as const),
          sym === 'SPY' ? Promise.resolve(spyRecent) : etfBars(sym, from).then((s) => s.bars).catch(() => [] as Bar[]),
        ]);
        const b = sym === 'SPY' ? 1 : beta(bars, spyRecent);
        return { sym, hunt, beta: b };
      }),
    );

    // Trajectory (SPY): history to the latest stored close, plus the live price.
    const spyHunt = scans.find((s) => s.sym === 'SPY')?.hunt;
    const livePrice = spyHunt && !('failed' in spyHunt) ? spyHunt.underlyingPrice : null;
    const liveDate = spyHunt && !('failed' in spyHunt) && spyHunt.underlyingQuoteTime ? spyHunt.underlyingQuoteTime.slice(0, 10) : null;
    const allBars = [...spyBars];
    if (spyRecent.length) {
      const lastHist = allBars[allBars.length - 1]?.date ?? '';
      for (const b of spyRecent) if (b.date > lastHist) allBars.push(b);
    }
    const episodes = findEpisodes(allBars);
    const now0 = currentFall(allBars, livePrice, liveDate);
    const depthNow = now0?.depth ?? 0;
    // Only finished crashes are history; the fall in progress is today.
    const past = episodes.filter((e) => !now0 || e.peakDate !== now0.peakDate);
    const fh = fromHere(past, depthNow);
    const scen = worseThanEver(past, depthNow);

    const relPaths: { id: 'median' | 'worstPast' | 'worseThanEver'; rel: number[] }[] = [
      { id: 'median', rel: fh.median },
      { id: 'worstPast', rel: fh.worst },
      ...(scen ? [{ id: 'worseThanEver' as const, rel: scen.rel }] : []),
    ];

    const rows: SmallRow[] = [];
    const errors: { symbol: string; error: string }[] = [];
    for (const s of scans) {
      if ('failed' in s.hunt) {
        errors.push({ symbol: s.sym, error: s.hunt.failed });
        continue;
      }
      const S = s.hunt.underlyingPrice;
      if (S == null) continue;
      const bta = s.beta ?? null;
      for (const r of s.hunt.rows) {
        const c = r.ev.contract;
        const ask = c.ask;
        if (ask == null || c.bid == null || !(c.bid > 0)) continue;
        const cost = ask * 100;
        if (cost > budget + 1e-9) continue;
        const fundDrop = r.ev.declineToBreakeven;
        const b = bta ?? 1;
        rows.push({
          symbol: c.symbol,
          underlying: s.sym,
          strike: c.strike,
          expiration: c.expiration,
          dte: c.dte,
          ask,
          bid: c.bid,
          cost,
          contracts: Math.floor(budget / cost),
          delta: c.delta,
          iv: c.iv,
          openInterest: c.openInterest,
          thin: r.ev.flags.some((f) => f.startsWith('Thin:')),
          fundDrop,
          beta: bta,
          spyDrop: fundDrop != null && bta && bta > 0.05 ? fundDrop / bta : null,
          chanceWorthless: c.delta != null ? 1 - Math.abs(c.delta) : null,
          price: S,
          paths: relPaths.map((p) => ({
            id: p.id,
            atExpiry: putAtExpiry({ S, K: c.strike, dte: c.dte, beta: b, rel: p.rel }) / ask,
            best: bestIntrinsicOnPath({ S, K: c.strike, dte: c.dte, beta: b, rel: p.rel }) / ask,
          })),
        });
      }
    }
    rows.sort((a, b) => (a.spyDrop ?? a.fundDrop ?? 9) - (b.spyDrop ?? b.fundDrop ?? 9) || a.cost - b.cost);

    const toFromPeak = (rel: number[]) => rel.map((x) => Math.round(((1 + depthNow) * x - 1) * 10000) / 10000);
    return NextResponse.json({
      budget,
      asOf: market.score.asOf,
      regime: market.regime.regime,
      score: market.score.score,
      symbols: scans.map((s) => ({ symbol: s.sym, beta: s.beta, price: 'failed' in s.hunt ? null : s.hunt.underlyingPrice, scanned: 'failed' in s.hunt ? 0 : s.hunt.scanned })),
      rows: rows.slice(0, 80),
      totalRows: rows.length,
      errors,
      trajectory: {
        current: now0 ? { ...now0, path: pathsDownsample(now0.path) } : null,
        episodes: past.map((e) => ({ id: e.id, label: e.label, peakDate: e.peakDate, troughDate: e.troughDate, depth: e.depth, sessionsToTrough: e.sessionsToTrough, path: pathsDownsample(e.path) })),
        fromHere: { used: fh.used, horizons: fh.horizons, median: toFromPeak(fh.median), worst: toFromPeak(fh.worst), best: toFromPeak(fh.best) },
        scenario: scen ? { ...scen, path: toFromPeak(scen.rel), rel: undefined } : null,
      },
      historyBuiltAt: history.builtAt,
      label: 'History lines are real closes. "From here" lines are what past crashes did next. The worse-than-ever line is an assumption. Put values at expiration count intrinsic value only.',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
