import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { buildDataset, withImported } from '@/lib/crash/providers/dataset';
import { buildMarketView } from '@/lib/crash/market';
import { IMPORT_TARGETS } from '@/lib/crash/tradingviewCsv';
import type { LevelSeries } from '@/lib/crash/series';

export const runtime = 'nodejs';
// ~40 upstream series on a cold cache.
export const maxDuration = 60;

const IMPORT_IDS = new Set(IMPORT_TARGETS.map((t) => t.id));

/** Validate user-imported series (TradingView CSV exports kept in the browser). */
function parseImported(body: unknown): LevelSeries[] {
  if (!body || typeof body !== 'object') return [];
  const raw = (body as { imported?: unknown }).imported;
  if (!Array.isArray(raw)) return [];
  const out: LevelSeries[] = [];
  for (const s of raw.slice(0, 4)) {
    const id = String(s?.meta?.id ?? '');
    if (!IMPORT_IDS.has(id) || !Array.isArray(s?.points)) continue;
    const points = (s.points as unknown[])
      .slice(-6000)
      .map((p) => p as { date?: unknown; value?: unknown })
      .filter((p) => typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && typeof p.value === 'number' && Number.isFinite(p.value))
      .map((p) => ({ date: p.date as string, value: p.value as number }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!points.length) continue;
    out.push({
      kind: 'level',
      meta: { id, label: IMPORT_TARGETS.find((t) => t.id === id)!.label, source: String(s.meta.source ?? 'TradingView CSV').slice(0, 120), unit: id === 'NET_NEW_HIGHS' ? 'count' : '%', freshness: 'As of the export; re-import to update' },
      points,
    });
  }
  return out;
}

async function handle(request: Request, imported: LevelSeries[]) {
  const limited = rateLimit(request, 'crash-market', { capacity: 20, perMinute: 10 });
  if (limited) return limited;
  const force = new URL(request.url).searchParams.get('refresh') === '1';
  try {
    const data = withImported(await buildDataset({ scope: 'live', force }), imported);
    return NextResponse.json(await buildMarketView(data));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}

/** GET /api/crash/market — Crash Intelligence score, regime, indicators, catalysts. */
export async function GET(request: Request) {
  return handle(request, []);
}

/** POST /api/crash/market — same, with the viewer's imported breadth series merged in. */
export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 600_000) return NextResponse.json({ error: 'Import too large' }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  return handle(request, parseImported(body));
}
