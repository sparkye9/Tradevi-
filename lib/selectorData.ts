/**
 * Fetch + cache layer for the Market Selector.
 *
 * - 2 years of daily bars per instrument from Yahoo (keyless, delayed).
 * - Each instrument is fetched in isolation: a failure is reported in
 *   `errors` and the rest of the page still renders.
 * - Daily view recomputes once per trading date (boundary 8:00 AM ET, before
 *   the US open). Weekly view recomputes once per week (boundary Sunday
 *   6:00 PM ET, the Globex reopen). `?refresh=1` forces a recompute.
 *   The cache is per server instance (Vercel lambdas are ephemeral), so an
 *   extra recompute after a cold start is possible and harmless.
 */
import type { YFCandle } from './yahooChart';
import { fetchDailyBars, BAR_SOURCE_LABEL, type BarSource } from './dailyBars';
import { MARKET_UNIVERSE, inRollWindow, type UniverseInstrument } from './marketUniverse';
import { computeSelector, rankSelector, type SelectorItem, type SelectorTimeframe } from './selector';
import { etDate, isoWeekKey } from './indicators';

export interface SelectorError {
  symbol: string;
  display: string;
  error: string;
}

/** Which feed answered for each instrument, so the UI can say so. */
export interface SelectorSource {
  source: BarSource;
  label: string;
  /** Set when the primary feed failed and a fallback answered. */
  fallbackReason?: string;
}

export interface SelectorResponse {
  view: SelectorTimeframe;
  items: SelectorItem[];
  /** Weekly view only: the three best instruments for the week. */
  top3?: SelectorItem[];
  errors: SelectorError[];
  updated_at: string;
  /** When this view will next recompute (cache boundary). */
  next_recompute: string;
  source: string;
  /** Per-instrument feed actually used, keyed by symbol. */
  sources: Record<string, SelectorSource>;
  cache_key: string;
}

const CONCURRENCY = 3;
const SOURCE = 'Free daily bars (Yahoo delayed, Stooq end-of-day fallback), weekly/monthly resampled in-app';

function etParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { weekday: get('weekday'), hour: Number(get('hour')) };
}

/** Daily key: the ET date, rolling over at 8:00 AM ET. */
export function dailyCacheKey(now: Date): string {
  const { hour } = etParts(now);
  const shifted = hour < 8 ? new Date(now.getTime() - 8 * 3600 * 1000) : now;
  return etDate(Math.floor(shifted.getTime() / 1000));
}

/** Weekly key: ISO week (Monday date), rolling over at Sunday 6:00 PM ET. */
export function weeklyCacheKey(now: Date): string {
  // Shift by +6 h so Sunday 18:00 ET becomes Monday 00:00 ET.
  const shifted = new Date(now.getTime() + 6 * 3600 * 1000);
  return isoWeekKey(etDate(Math.floor(shifted.getTime() / 1000)));
}

function nextDailyRecompute(now: Date): string {
  const { hour } = etParts(now);
  const base = new Date(now);
  // Walk forward to the next 8:00 AM ET.
  const target = new Date(base.getTime() + (hour < 8 ? 0 : 24 * 3600 * 1000));
  const ymd = etDate(Math.floor(target.getTime() / 1000));
  return `${ymd} 08:00 ET`;
}

function nextWeeklyRecompute(): string {
  return 'Sunday 6:00 PM ET';
}

// ─── bar cache ──────────────────────────────────────────────────────────────

interface BarCache {
  key: string;
  bars: Map<string, YFCandle[]>;
  sources: Map<string, SelectorSource>;
  errors: SelectorError[];
}
let barCache: BarCache | null = null;
let barInFlight: Promise<BarCache> | null = null;

async function fetchBars(key: string): Promise<BarCache> {
  const bars = new Map<string, YFCandle[]>();
  const sources = new Map<string, SelectorSource>();
  const errors: SelectorError[] = [];
  const queue: UniverseInstrument[] = [...MARKET_UNIVERSE];
  async function worker() {
    while (queue.length) {
      const u = queue.shift()!;
      try {
        const { candles, source, fallbackReason } = await fetchDailyBars(u, '2y');
        bars.set(u.symbol, candles);
        sources.set(u.symbol, { source, label: BAR_SOURCE_LABEL[source], fallbackReason });
      } catch (e) {
        errors.push({ symbol: u.symbol, display: u.display, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { key, bars, sources, errors };
}

async function barsFor(key: string, force: boolean): Promise<BarCache> {
  if (!force && barCache && barCache.key === key) return barCache;
  if (barInFlight) return barInFlight;
  barInFlight = fetchBars(key)
    .then((c) => {
      if (c.bars.size > 0) barCache = c;
      return c;
    })
    .finally(() => {
      barInFlight = null;
    });
  return barInFlight;
}

// ─── view cache ─────────────────────────────────────────────────────────────

const viewCache = new Map<string, SelectorResponse>();

function buildView(view: SelectorTimeframe, bars: BarCache, now: Date, key: string): SelectorResponse {
  const items: SelectorItem[] = [];
  const errors: SelectorError[] = [...bars.errors];
  for (const u of MARKET_UNIVERSE) {
    const daily = bars.bars.get(u.symbol);
    if (!daily) continue;
    try {
      items.push(
        computeSelector({
          symbol: u.symbol,
          display: u.display,
          tradeAs: u.tradeAs,
          daily,
          now,
          timeframe: view,
          inRollWindow: (ymd) => inRollWindow(u, ymd),
        }),
      );
    } catch (e) {
      errors.push({ symbol: u.symbol, display: u.display, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const ranked = rankSelector(items);
  return {
    view,
    items: ranked,
    top3: view === 'weekly' ? ranked.slice(0, 3) : undefined,
    errors,
    updated_at: now.toISOString(),
    next_recompute: view === 'daily' ? nextDailyRecompute(now) : nextWeeklyRecompute(),
    source: SOURCE,
    sources: Object.fromEntries(bars.sources),
    cache_key: key,
  };
}

export async function selectorView(view: SelectorTimeframe, opts: { force?: boolean; now?: Date } = {}): Promise<SelectorResponse> {
  const now = opts.now ?? new Date();
  const key = view === 'daily' ? dailyCacheKey(now) : weeklyCacheKey(now);
  const cacheId = `${view}:${key}`;
  const cached = viewCache.get(cacheId);
  if (!opts.force && cached) return cached;

  const bars = await barsFor(dailyCacheKey(now), Boolean(opts.force));
  const built = buildView(view, bars, now, key);
  // Only cache a view that has at least one instrument so a total outage retries.
  if (built.items.length > 0) viewCache.set(cacheId, built);
  return built;
}
