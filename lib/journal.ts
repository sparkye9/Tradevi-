import type { JournalEntry } from '@/lib/types';

export const LOCAL_JOURNAL_KEY = 'tradewise-journal';
export const LOCAL_JOURNAL_MIGRATED_KEY = 'tradewise-journal-migrated-user';

export interface JournalStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
}

type JournalRow = {
  id: string;
  user_id: string;
  ticker: string;
  contract: string | null;
  entry_price: number | string;
  exit_price: number | string | null;
  setup: string | null;
  trigger_reason: string | null;
  emotion: string | null;
  followed_rules: boolean | null;
  profit_loss: number | string | null;
  profit_loss_pct: number | string | null;
  lesson_learned: string | null;
  created_at: string;
  closed_at: string | null;
  status: 'open' | 'closed';
  alert_id: string | null;
};

function num(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function rowToEntry(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    alertId: row.alert_id ?? undefined,
    ticker: row.ticker,
    contract: row.contract ?? row.ticker,
    entryPrice: num(row.entry_price) ?? 0,
    exitPrice: num(row.exit_price),
    setup: row.setup ?? '',
    triggerReason: row.trigger_reason ?? '',
    emotion: row.emotion ?? 'calm',
    followedRules: row.followed_rules ?? true,
    profitLoss: num(row.profit_loss),
    profitLossPct: num(row.profit_loss_pct),
    lessonLearned: row.lesson_learned ?? undefined,
    createdAt: row.created_at,
    closedAt: row.closed_at ?? undefined,
    status: row.status,
  };
}

export function closeFields(entry: JournalEntry, exitPrice: number, lesson?: string) {
  const pnl = (exitPrice - entry.entryPrice) * 100;
  const pnlPct = entry.entryPrice !== 0 ? ((exitPrice - entry.entryPrice) / entry.entryPrice) * 100 : 0;
  return {
    exit_price: exitPrice,
    profit_loss: Math.round(pnl * 100) / 100,
    profit_loss_pct: Math.round(pnlPct * 10) / 10,
    lesson_learned: lesson ?? null,
    status: 'closed' as const,
    closed_at: new Date().toISOString(),
  };
}

export function insertFields(userId: string, entry: Omit<JournalEntry, 'id' | 'createdAt' | 'status'>) {
  return {
    user_id: userId,
    ticker: entry.ticker,
    contract: entry.contract,
    entry_price: entry.entryPrice,
    setup: entry.setup,
    trigger_reason: entry.triggerReason,
    emotion: entry.emotion,
    followed_rules: entry.followedRules,
    alert_id: entry.alertId ?? null,
    status: 'open' as const,
  };
}

export function journalStats(entries: JournalEntry[]): JournalStats {
  const closed = entries.filter((e) => e.status === 'closed' && e.profitLoss != null);
  const wins = closed.filter((e) => (e.profitLoss ?? 0) > 0).length;
  const totalPnL = closed.reduce((sum, e) => sum + (e.profitLoss ?? 0), 0);
  return {
    totalTrades: closed.length,
    wins,
    losses: closed.length - wins,
    winRate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
    totalPnL: Math.round(totalPnL * 100) / 100,
  };
}

export function journalEdge(entries: JournalEntry[]): JournalStats & { bestSetup: string | null; openCount: number } {
  const stats = journalStats(entries);
  const closed = entries.filter((e) => e.status === 'closed');
  const counts = new Map<string, number>();
  for (const e of closed) {
    const key = (e.setup || 'manual').trim() || 'manual';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bestSetup: string | null = null;
  let bestN = 0;
  for (const [key, n] of Array.from(counts.entries())) {
    if (n > bestN) {
      bestSetup = key;
      bestN = n;
    }
  }
  return {
    ...stats,
    bestSetup,
    openCount: entries.filter((e) => e.status === 'open').length,
  };
}

export function readLocalJournal(): JournalEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_JOURNAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { state?: { entries?: JournalEntry[] } };
    return Array.isArray(parsed.state?.entries) ? parsed.state.entries : [];
  } catch {
    return [];
  }
}

export function clearLocalJournal() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOCAL_JOURNAL_KEY);
}
