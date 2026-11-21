/**
 * Reproducibility and market-data validation for simulator runs.
 *
 * Every run returns a manifest: engine version, the exact parameters, each
 * series' source and fingerprint over the date range used, and the options
 * data kind. Re-running with the saved parameters recomputes the manifest;
 * equal fingerprints mean the same inputs, and a changed fingerprint names
 * the series that changed (a vendor revision or a provider switch).
 */
import type { MarketDataset } from '../series';

export const ENGINE_VERSION = 'crash-sim 1.0.0';

export interface SeriesFingerprint {
  id: string;
  source: string;
  first: string | null;
  last: string | null;
  count: number;
  hash: string;
  vintage: boolean;
  revisable: boolean;
}

export interface RunManifest {
  engineVersion: string;
  appVersion: string | null;
  createdAt: string;
  kind: 'evaluation' | 'lab' | 'trade' | 'replay';
  params: unknown;
  range: { from: string; to: string };
  series: SeriesFingerprint[];
  datasetHash: string;
  options: { kind: 'actual' | 'theoretical' | 'mixed' | 'none'; source: string };
  resultHash: string | null;
}

/** FNV-1a 32-bit, hex. Stable across platforms. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function fingerprint(data: MarketDataset, to: string): SeriesFingerprint[] {
  return Object.values(data.series)
    .map((s) => {
      const pts = s.kind === 'bars' ? s.bars.filter((b) => b.date <= to).map((b) => `${b.date}:${b.close}`) : s.points.filter((p) => p.date <= to).map((p) => `${p.date}:${p.value}:${p.availableOn ?? ''}`);
      const dates = s.kind === 'bars' ? s.bars.filter((b) => b.date <= to).map((b) => b.date) : s.points.filter((p) => p.date <= to).map((p) => p.date);
      return { id: s.meta.id, source: s.meta.source, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null, count: dates.length, hash: fnv1a(pts.join('|')), vintage: !!s.meta.vintage, revisable: !!s.meta.revisable };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function makeManifest(args: {
  kind: RunManifest['kind'];
  params: unknown;
  data: MarketDataset;
  range: { from: string; to: string };
  options: RunManifest['options'];
  result?: unknown;
}): RunManifest {
  const series = fingerprint(args.data, args.range.to);
  return {
    engineVersion: ENGINE_VERSION,
    appVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.npm_package_version ?? null,
    createdAt: new Date().toISOString(),
    kind: args.kind,
    params: args.params,
    range: args.range,
    series,
    datasetHash: fnv1a(series.map((s) => `${s.id}:${s.hash}`).join('|')),
    options: args.options,
    resultHash: args.result === undefined ? null : fnv1a(JSON.stringify(args.result)),
  };
}

export interface ReproCheck {
  sameEngine: boolean;
  sameData: boolean;
  sameResult: boolean | null;
  changedSeries: string[];
}

export function compareManifests(saved: RunManifest, fresh: RunManifest): ReproCheck {
  const old = new Map(saved.series.map((s) => [s.id, s.hash]));
  const changed = fresh.series.filter((s) => old.get(s.id) !== s.hash).map((s) => s.id);
  saved.series.forEach((s) => {
    if (!fresh.series.some((f) => f.id === s.id)) changed.push(s.id);
  });
  return {
    sameEngine: saved.engineVersion === fresh.engineVersion,
    sameData: saved.datasetHash === fresh.datasetHash,
    sameResult: saved.resultHash && fresh.resultHash ? saved.resultHash === fresh.resultHash : null,
    changedSeries: changed,
  };
}

// ─── Market data validation ───────────────────────────────────────────────

export interface SeriesIssue {
  id: string;
  issue: string;
  count: number;
  example?: string;
}

/**
 * Checks each series for duplicate or out-of-order dates, non-positive
 * prices, gaps longer than a week (missing dates), one-day moves over 25%
 * on an ETF (a likely unadjusted split), and revisable series used without
 * first-release vintages (not strict point-in-time).
 */
export function validateDataset(data: MarketDataset): SeriesIssue[] {
  const out: SeriesIssue[] = [];
  for (const s of Object.values(data.series)) {
    const id = s.meta.id;
    const dates = s.kind === 'bars' ? s.bars.map((b) => b.date) : s.points.map((p) => p.date);
    let dup = 0;
    let order = 0;
    let gaps = 0;
    let gapEx: string | undefined;
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] === dates[i - 1]) dup++;
      else if (dates[i] < dates[i - 1]) order++;
      const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86_400_000;
      const weekly = /weekly/i.test(s.meta.freshness);
      if (gap > (weekly ? 15 : 7)) {
        gaps++;
        gapEx ??= `${dates[i - 1]} → ${dates[i]}`;
      }
    }
    if (dup) out.push({ id, issue: 'Duplicate dates', count: dup });
    if (order) out.push({ id, issue: 'Dates out of order', count: order });
    if (gaps) out.push({ id, issue: 'Gaps longer than a week (missing dates)', count: gaps, example: gapEx });
    if (s.kind === 'bars') {
      const bad = s.bars.filter((b) => !(b.close > 0)).length;
      if (bad) out.push({ id, issue: 'Non-positive or missing close', count: bad });
      let jumps = 0;
      let jEx: string | undefined;
      for (let i = 1; i < s.bars.length; i++) {
        const r = s.bars[i].close / s.bars[i - 1].close - 1;
        if (Math.abs(r) > 0.25) {
          jumps++;
          jEx ??= `${s.bars[i].date} ${(r * 100).toFixed(0)}%`;
        }
      }
      if (jumps) out.push({ id, issue: 'One-day move over 25% (check split adjustment)', count: jumps, example: jEx });
    }
    if (s.meta.revisable && !s.meta.vintage) out.push({ id, issue: 'Revisable series without first-release vintages: not strict point-in-time', count: 1 });
  }
  return out;
}
