/**
 * Readiness for every instrument in lib/marketUniverse.ts, with per-instrument
 * error isolation, a short in-memory cache and bounded concurrency so a page
 * load does not fire 40 Yahoo requests at once.
 */
import { trendBiasStack, highImpactCalendar, type TrendBiasStackResult } from './trendBias';
import { MARKET_UNIVERSE } from './marketUniverse';
import type { ReadinessResult } from './readiness';

export interface ReadinessBoardItem extends ReadinessResult {
  instrument: string;
  display: string;
  tradeAs: string;
  tv: string;
  dataSymbol: string;
  lastPrice: number | null;
  dailyBias: 'up' | 'down' | 'range';
}

export interface ReadinessBoard {
  items: ReadinessBoardItem[];
  errors: { instrument: string; display: string; error: string }[];
  updated_at: string;
  source: string;
}

const TTL_MS = 5 * 60 * 1000;
// Each stack fires four Yahoo requests in parallel, so 2 workers = 8 in flight.
const CONCURRENCY = 2;

let cache: { data: ReadinessBoard; ts: number } | null = null;
let inFlight: Promise<ReadinessBoard> | null = null;

function toItem(stack: TrendBiasStackResult): ReadinessBoardItem {
  const u = MARKET_UNIVERSE.find((row) => row.readinessInstrument === stack.instrument);
  return {
    ...stack.readiness,
    instrument: stack.instrument,
    display: u?.display ?? stack.instrument,
    tradeAs: u?.tradeAs ?? stack.instrument,
    tv: u?.tv ?? `${stack.instrument}1!`,
    dataSymbol: stack.dataSymbol,
    lastPrice: stack.lastPrice,
    dailyBias: stack.reads.Daily.bias,
  };
}

async function build(force: boolean): Promise<ReadinessBoard> {
  const items: ReadinessBoardItem[] = [];
  const errors: ReadinessBoard['errors'] = [];
  const queue = [...MARKET_UNIVERSE];
  // One calendar fetch for the whole board.
  const calendar = await highImpactCalendar();

  async function worker() {
    while (queue.length) {
      const u = queue.shift()!;
      try {
        const stack = await trendBiasStack(u.readinessInstrument, { calendar, force });
        items.push(toItem(stack));
      } catch (e) {
        errors.push({ instrument: u.readinessInstrument, display: u.display, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const order = new Map(MARKET_UNIVERSE.map((u, i) => [u.readinessInstrument, i]));
  items.sort((a, b) => (order.get(a.instrument) ?? 99) - (order.get(b.instrument) ?? 99));

  return { items, errors, updated_at: new Date().toISOString(), source: 'Yahoo Finance (delayed)' };
}

export async function readinessBoard(force = false): Promise<ReadinessBoard> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache.data;
  if (inFlight) return inFlight;
  inFlight = build(force)
    .then((data) => {
      // Only cache when at least one instrument came back; otherwise retry next call.
      if (data.items.length) cache = { data, ts: Date.now() };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
