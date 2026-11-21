/**
 * TradingView breadth, the two allowed ways. TradingView has no data API and
 * its terms forbid scraping, so Tradevi never pulls from it directly.
 *
 *  1. CSV export: the user exports a breadth chart (e.g. INDEX:S5FI) from
 *     TradingView and imports the file on the Crash Intelligence page. Parsed
 *     here; stored in the viewer's browser.
 *  2. Alert webhook: a daily alert on the breadth symbol posts to the
 *     existing /api/tradingview/webhook with a message like
 *       {"secret":"…","symbol":"{{ticker}}","close":"{{close}}","time":"{{timenow}}"}
 *     and the reading is picked up from the tv_alerts table.
 */
import type { LevelSeries } from '../series';
import { IMPORT_TARGETS, TV_BREADTH_SYMBOLS, toYmd } from '../tradingviewCsv';

export { IMPORT_TARGETS, TV_BREADTH_SYMBOLS, importedSeries, parseTradingViewCsv } from '../tradingviewCsv';

/** Breadth readings that arrived through the TradingView alert webhook (needs Supabase). */
export async function tradingViewBreadth(): Promise<LevelSeries[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const { createAdminClient } = await import('../../supabase/admin');
  const admin = createAdminClient();
  const syms = Object.keys(TV_BREADTH_SYMBOLS);
  const variants = syms.flatMap((s) => [s, `INDEX:${s}`]);
  const { data, error } = await admin
    .from('tv_alerts')
    .select('symbol, payload, received_at')
    .in('symbol', variants)
    .order('received_at', { ascending: true })
    .limit(5000);
  if (error) throw new Error(`TradingView alerts: ${error.message}`);
  const by = new Map<string, Map<string, number>>();
  for (const row of data ?? []) {
    const sym = String(row.symbol).replace(/^INDEX:/, '');
    const spec = TV_BREADTH_SYMBOLS[sym];
    const p = (row.payload ?? {}) as Record<string, unknown>;
    const v = Number(p.close ?? p.value);
    if (!spec || !Number.isFinite(v)) continue;
    const d = toYmd(String(row.received_at)) ?? String(row.received_at).slice(0, 10);
    if (!by.has(spec.id)) by.set(spec.id, new Map());
    by.get(spec.id)!.set(d, v);
  }
  return Array.from(by).map(([id, m]) => ({
    kind: 'level' as const,
    meta: { id, label: IMPORT_TARGETS.find((t) => t.id === id)?.label ?? id, source: 'TradingView alert webhook', unit: '%', freshness: 'Latest alert received' },
    points: Array.from(m).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value })),
  }));
}
