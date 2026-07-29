// lib/opportunityScore.ts — the ONE opportunity engine every screen imports.
//
// Before this file existed, five screens (Dashboard, Trade Discovery, Swing,
// Intraday, Power Hour) ranked a ticker by counting up to 5 boolean flags
// (0-5), while Small Account Edge ranked the same ticker on a weighted 0-100
// scale with different inputs. The same stock could rank #1 on one tab and
// be unranked on another. This module is the single source of truth so that
// never happens again — every screen scores, directs, and explains a quote
// the same way.

import type { FinvizQuote } from './finviz';

export type Direction = 'BULLISH' | 'BEARISH' | 'WATCH';

export interface IntradayLevels {
  entry: number;
  stop: number;
  t1: number;
  t2: number;
  t3: number;
  rr: number;
  holdTime: string;
}

export interface SwingLevels {
  entryZone: string;
  support: string;
  invalidation: string;
  t1: number;
  t2: number;
  t3: number;
  rr: number;
  holdTime: string;
}

/**
 * Opportunity Score (0-100), weighted across the real signals Tradevi has:
 * relative volume, unusual volume flag, new session high, trend alignment
 * (SMA 50/200), sector strength, and gap momentum. This is the only scoring
 * function in the app — every screen must import it rather than deriving
 * its own count.
 */
export function computeOpportunityScore(q: FinvizQuote, rvolThreshold: number): number {
  let score = 0;

  // RVOL — most weight (0-40 pts)
  const rvol = q.rvol ?? 0;
  score += Math.min((rvol / 5) * 40, 40);

  // Unusual volume flag (+15)
  if (q.unusualVolume) score += 15;

  // New day high (+12)
  if (q.newHighDay) score += 12;

  // SMA alignment (+8 each)
  if (q.sma50rel === 'above') score += 8;
  if (q.sma200rel === 'above') score += 8;

  // Sector strength (+7)
  if (q.groupStrength === 'strong') score += 7;

  // Gap momentum (+5 for gap > 1%, up or down)
  if (q.gap !== null && Math.abs(q.gap) >= 1) score += 5;

  // RVOL at or above threshold bonus (+5)
  if (rvol >= rvolThreshold) score += 5;

  return Math.min(Math.round(score), 100);
}

export function deriveDirection(q: FinvizQuote): Direction {
  const chg = q.changePercent ?? 0;
  if (chg >= 0.5 && (q.sma50rel === 'above' || (q.gap ?? 0) > 0)) return 'BULLISH';
  if (chg <= -0.5 && (q.sma50rel === 'below' || (q.gap ?? 0) < 0)) return 'BEARISH';
  return 'WATCH';
}

/** Intermediate/Advanced-mode reason string — raw signal names (RVOL, SMA, sector). */
export function generateReason(q: FinvizQuote): string {
  const parts: string[] = [];
  if ((q.rvol ?? 0) >= 3) parts.push(`${q.rvol!.toFixed(1)}x relative volume`);
  else if ((q.rvol ?? 0) >= 1.5) parts.push(`elevated volume (${q.rvol!.toFixed(1)}x avg)`);
  if (q.unusualVolume) parts.push('unusual volume spike');
  if (q.newHighDay) parts.push('new session high');
  if (q.gap !== null && q.gap >= 1) parts.push(`+${q.gap.toFixed(1)}% gap up`);
  if (q.gap !== null && q.gap <= -1) parts.push(`${q.gap.toFixed(1)}% gap down`);
  if (q.sma50rel === 'above' && q.sma200rel === 'above') parts.push('price above SMA 50 & 200');
  else if (q.sma50rel === 'above') parts.push('above SMA 50');
  if (q.groupStrength === 'strong') parts.push('sector showing strength');
  if (q.groupStrength === 'weak') parts.push('sector showing weakness');
  if (parts.length === 0) parts.push('elevated momentum relative to peers');
  return parts.join(', ') + '.';
}

/** Beginner-mode reason string — same underlying signals, plain English, no jargon. */
export function generateBeginnerReason(q: FinvizQuote): string {
  const parts: string[] = [];
  if ((q.rvol ?? 0) >= 3) parts.push('much heavier trading than usual');
  else if ((q.rvol ?? 0) >= 1.5) parts.push('more trading activity than usual');
  if (q.newHighDay) parts.push('just hit a new high for the day');
  if (q.gap !== null && q.gap >= 1) parts.push('opened sharply higher');
  if (q.gap !== null && q.gap <= -1) parts.push('opened sharply lower');
  if (q.sma50rel === 'above' && q.sma200rel === 'above') parts.push('in a strong uptrend');
  else if (q.sma50rel === 'above') parts.push('trending upward');
  else if (q.sma50rel === 'below') parts.push('trending downward');
  if (q.groupStrength === 'strong') parts.push('its industry group is strong today');
  if (q.groupStrength === 'weak') parts.push('its industry group is weak today');
  if (parts.length === 0) parts.push('showing more momentum than similar stocks');
  const joined = parts.join(', ');
  return joined.charAt(0).toUpperCase() + joined.slice(1) + '.';
}

// Estimated levels — based on fixed risk tiers, labeled as estimates.
export function computeIntradayLevels(price: number, dir: Direction): IntradayLevels | null {
  if (price <= 0) return null;
  if (dir === 'BULLISH') {
    const stop = +(price * 0.97).toFixed(2);
    const t1 = +(price * 1.05).toFixed(2);
    const t2 = +(price * 1.10).toFixed(2);
    const t3 = +(price * 1.20).toFixed(2);
    const rr = +((t1 - price) / (price - stop)).toFixed(1);
    return { entry: price, stop, t1, t2, t3, rr, holdTime: '30 min – 2 hrs' };
  }
  if (dir === 'BEARISH') {
    const stop = +(price * 1.03).toFixed(2);
    const t1 = +(price * 0.95).toFixed(2);
    const t2 = +(price * 0.90).toFixed(2);
    const t3 = +(price * 0.80).toFixed(2);
    const rr = +((price - t1) / (stop - price)).toFixed(1);
    return { entry: price, stop, t1, t2, t3, rr, holdTime: '30 min – 2 hrs' };
  }
  return null;
}

export function computeSwingLevels(price: number, dir: Direction): SwingLevels | null {
  if (price <= 0) return null;
  if (dir === 'BULLISH') {
    const stop = +(price * 0.94).toFixed(2);
    const entryLow = +(price * 0.99).toFixed(2);
    const entryHigh = +(price * 1.01).toFixed(2);
    const t1 = +(price * 1.10).toFixed(2);
    const t2 = +(price * 1.20).toFixed(2);
    const t3 = +(price * 1.35).toFixed(2);
    const rr = +((t1 - price) / (price - stop)).toFixed(1);
    return { entryZone: `$${entryLow}–$${entryHigh}`, support: `$${stop}`, invalidation: `$${stop}`, t1, t2, t3, rr, holdTime: '2–10 days' };
  }
  if (dir === 'BEARISH') {
    const stop = +(price * 1.06).toFixed(2);
    const entryLow = +(price * 0.99).toFixed(2);
    const entryHigh = +(price * 1.01).toFixed(2);
    const t1 = +(price * 0.90).toFixed(2);
    const t2 = +(price * 0.82).toFixed(2);
    const t3 = +(price * 0.72).toFixed(2);
    const rr = +((price - t1) / (stop - price)).toFixed(1);
    return { entryZone: `$${entryLow}–$${entryHigh}`, support: `$${stop}`, invalidation: `$${stop}`, t1, t2, t3, rr, holdTime: '3–14 days' };
  }
  return null;
}

export interface ScoredQuote {
  q: FinvizQuote;
  score: number;
  direction: Direction;
}

/** Score + rank a list of quotes with the one shared engine. Highest score first. */
export function rankByOpportunity(quotes: FinvizQuote[], rvolThreshold: number): ScoredQuote[] {
  return quotes
    .map((q) => ({ q, score: computeOpportunityScore(q, rvolThreshold), direction: deriveDirection(q) }))
    .sort((a, b) => b.score - a.score);
}
