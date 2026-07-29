// lib/labels.ts — mode-aware copy. Same underlying data, different words.
// Beginner mode never shows a raw indicator name (RVOL, SMA, CHOCH, BOS, FVG);
// Intermediate/Advanced keep the trader vocabulary the app has always used.

import type { FinvizQuote } from './finviz';
import type { ExperienceMode } from '@/store/tradeviStore';

export function isBeginner(mode: ExperienceMode): boolean {
  return mode === 'beginner';
}

export function isAdvanced(mode: ExperienceMode): boolean {
  return mode === 'advanced';
}

/** "RVOL 2.40x" for Intermediate/Advanced, "Buying pressure: High" for Beginner. */
export function volumeLabel(q: FinvizQuote, mode: ExperienceMode): string {
  const rvol = q.rvol ?? 0;
  if (!isBeginner(mode)) {
    return q.rvol !== null ? `RVOL ${q.rvol.toFixed(2)}` : '--';
  }
  if (rvol >= 3) return 'Buying pressure: Very High';
  if (rvol >= 1.5) return 'Buying pressure: High';
  if (rvol >= 0.8) return 'Buying pressure: Normal';
  return 'Buying pressure: Low';
}

/** "SMA50 ▲" for Intermediate/Advanced, "Trend: Up" for Beginner. */
export function trendLabel(q: FinvizQuote, mode: ExperienceMode): string {
  if (!isBeginner(mode)) {
    const s50 = q.sma50rel === 'above' ? '▲' : q.sma50rel === 'below' ? '▼' : '?';
    const s200 = q.sma200rel === 'above' ? '▲' : q.sma200rel === 'below' ? '▼' : '?';
    return `SMA50 ${s50} · SMA200 ${s200}`;
  }
  if (q.sma50rel === 'above' && q.sma200rel === 'above') return 'Trend: Strong Up';
  if (q.sma50rel === 'below' && q.sma200rel === 'below') return 'Trend: Strong Down';
  if (q.sma50rel === 'above') return 'Trend: Up';
  if (q.sma50rel === 'below') return 'Trend: Down';
  return 'Trend: Mixed';
}

/** "Sector: strong" for Intermediate/Advanced, "Its industry group is strong" for Beginner. */
export function sectorLabel(q: FinvizQuote, mode: ExperienceMode): string | null {
  if (!q.groupStrength || q.groupStrength === 'neutral') return null;
  if (!isBeginner(mode)) return `Sector ${q.groupStrength}`;
  return q.groupStrength === 'strong' ? 'Industry group: strong' : 'Industry group: weak';
}

/** Delta 0.20-0.70 → "Δ0.42" for Intermediate/Advanced, "Moves with the stock" for Beginner. */
export function deltaLabel(delta: number | null, mode: ExperienceMode): string {
  if (delta === null) return '--';
  if (!isBeginner(mode)) return `Δ${delta.toFixed(2)}`;
  const abs = Math.abs(delta);
  if (abs >= 0.55) return 'Moves closely with the stock';
  if (abs >= 0.35) return 'Moves moderately with the stock';
  return 'Moves loosely with the stock';
}
