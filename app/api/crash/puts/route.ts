import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { buildDataset } from '@/lib/crash/providers/dataset';
import { buildMarketView } from '@/lib/crash/market';
import { huntPuts } from '@/lib/crash/hunter';
import { LEAPS_FILTERS, LONG_TERM_FILTERS, SHORT_TERM_FILTERS, type ScreenFilters } from '@/lib/crash/config';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const NUM_KEYS: (keyof ScreenFilters)[] = ['minPremium', 'maxPremium', 'minDte', 'maxDte', 'minAbsDelta', 'maxAbsDelta', 'minOpenInterest', 'minVolume', 'maxSpreadPct', 'maxGreeksAgeMin'];

/** GET /api/crash/puts?symbol=SPY&horizon=short|long|leaps[&minPremium=…] — Put Hunter scan. */
export async function GET(request: Request) {
  const limited = rateLimit(request, 'crash-puts', { capacity: 20, perMinute: 12 });
  if (limited) return limited;
  const sp = new URL(request.url).searchParams;
  const symbol = (sp.get('symbol') ?? 'SPY').toUpperCase().trim();
  if (!SYMBOL_RE.test(symbol)) return NextResponse.json({ error: 'Enter a valid ticker symbol, like SPY or QQQ.' }, { status: 400 });
  const horizon = sp.get('horizon');
  const filters: ScreenFilters = { ...(horizon === 'long' ? LONG_TERM_FILTERS : horizon === 'leaps' ? LEAPS_FILTERS : SHORT_TERM_FILTERS) };
  for (const k of NUM_KEYS) {
    const v = sp.get(k);
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) filters[k] = n;
  }
  filters.maxDte = Math.min(filters.maxDte, 900);
  try {
    const data = await buildDataset({ scope: 'live' });
    const market = await buildMarketView(data);
    const result = await huntPuts({ symbol, filters, market, data, catalysts: market.catalysts });
    return NextResponse.json({ market: { score: market.score.score, band: market.score.band, coverage: market.score.coverage, regime: market.regime.regime, insufficient: market.regime.insufficient, why: market.regime.why, asOf: market.score.asOf }, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
