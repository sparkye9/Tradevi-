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
import type { LevelPoint, LevelSeries } from '../series';

/** TradingView breadth symbols and the series they fill. */
export const TV_BREADTH_SYMBOLS: Record<string, { id: string; label: string }> = {
  S5TW: { id: 'BREADTH_20', label: '% of S&P 500 above 20-day (S5TW)' },
  S5FI: { id: 'BREADTH_50', label: '% of S&P 500 above 50-day (S5FI)' },
  S5TH: { id: 'BREADTH_200', label: '% of S&P 500 above 200-day (S5TH)' },
  MMTW: { id: 'BREADTH_20', label: '% of all stocks above 20-day (MMTW)' },
  MMFI: { id: 'BREADTH_50', label: '% of all stocks above 50-day (MMFI)' },
  MMTH: { id: 'BREADTH_200', label: '% of all stocks above 200-day (MMTH)' },
};

export const IMPORT_TARGETS: { id: string; label: string }[] = [
  { id: 'BREADTH_20', label: '% above 20-day moving average' },
  { id: 'BREADTH_50', label: '% above 50-day moving average' },
  { id: 'BREADTH_200', label: '% above 200-day moving average' },
  { id: 'NET_NEW_HIGHS', label: 'Net new 52-week highs (highs − lows)' },
];

function toYmd(raw: string): string | null {
  const s = raw.trim().replace(/"/g, '');
  if (/^\d{9,11}$/.test(s)) {
    const d = new Date(Number(s) * 1000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

/**
 * Parse a TradingView chart export. The export has a `time` column (unix
 * seconds or ISO) and `close` (plus open/high/low and any plotted
 * indicators). Throws when the file is not that shape.
 */
export function parseTradingViewCsv(text: string): LevelPoint[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('The file has no data rows.');
  const header = lines[0].split(',').map((h) => h.trim().replace(/"/g, '').toLowerCase());
  const iTime = header.findIndex((h) => h === 'time' || h === 'date');
  const iClose = header.indexOf('close');
  if (iTime < 0 || iClose < 0) throw new Error('Expected TradingView export columns "time" and "close".');
  const m = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const d = toYmd(cells[iTime] ?? '');
    const v = Number(cells[iClose]);
    if (d && Number.isFinite(v)) m.set(d, v);
  }
  if (!m.size) throw new Error('No rows with a date and a close value.');
  return Array.from(m).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
}

export function importedSeries(id: string, points: LevelPoint[], fileName: string, importedAt: string): LevelSeries {
  const label = IMPORT_TARGETS.find((t) => t.id === id)?.label ?? id;
  return {
    kind: 'level',
    meta: { id, label, source: `TradingView CSV (${fileName}, imported ${importedAt.slice(0, 10)})`, unit: id === 'NET_NEW_HIGHS' ? 'count' : '%', freshness: 'As of the export; re-import to update' },
    points,
  };
}

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
