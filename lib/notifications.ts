// lib/notifications.ts — turns a score refresh into actionable notifications.
// Pure function so Home (or Scanner, later) can call it after every fetch
// without owning the "is this actually new" logic itself.

import type { NotificationLevel } from '@/store/notificationsStore';

export interface NotificationInput {
  symbol: string;
  message: string;
  level: NotificationLevel;
}

export interface RankedEntry {
  symbol: string;
  score: number;
}

const HIGH_CONFIDENCE = 85;
const TOP_ENTRY_THRESHOLD = 70;
const WEAKENING_DROP = 15;

/**
 * Compares this refresh's top-ranked symbols against the last-seen scores
 * and produces notifications for: a new symbol entering the top ranks with
 * a strong score, a tracked symbol crossing into high-confidence territory,
 * and a tracked symbol's score dropping sharply (momentum weakening).
 */
export function diffOpportunityScores(
  prevScores: Record<string, number>,
  topRanked: RankedEntry[]
): { toPush: NotificationInput[]; nextScores: Record<string, number> } {
  const toPush: NotificationInput[] = [];
  const nextScores = { ...prevScores };

  for (const { symbol, score } of topRanked) {
    const prev = prevScores[symbol];

    if (prev === undefined && score >= TOP_ENTRY_THRESHOLD) {
      toPush.push({
        symbol,
        level: 'good',
        message: `${symbol} entered today's top opportunities — Score ${score}.`,
      });
    } else if (prev !== undefined && prev < HIGH_CONFIDENCE && score >= HIGH_CONFIDENCE) {
      toPush.push({
        symbol,
        level: 'good',
        message: `${symbol} just became a high-confidence setup — Score ${score}.`,
      });
    } else if (prev !== undefined && prev - score >= WEAKENING_DROP) {
      toPush.push({
        symbol,
        level: 'warn',
        message: `${symbol} momentum weakening — score dropped from ${prev} to ${score}.`,
      });
    }

    nextScores[symbol] = score;
  }

  return { toPush, nextScores };
}
