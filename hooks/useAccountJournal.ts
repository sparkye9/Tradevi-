'use client';
import { useCallback, useEffect, useState } from 'react';
import type { JournalEntry } from '@/lib/types';
import { LOCAL_JOURNAL_KEY, closeFields, journalStats, readLocalJournal, type JournalStats } from '@/lib/journal';

// Accounts are off for now, so the journal lives in this browser only.
function writeLocalJournal(entries: JournalEntry[]) {
  try {
    window.localStorage.setItem(LOCAL_JOURNAL_KEY, JSON.stringify({ state: { entries } }));
  } catch {
    // Private mode / storage blocked — keep the in-memory list.
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useAccountJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState('');

  const load = useCallback(() => {
    setEntries(readLocalJournal());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function update(fn: (current: JournalEntry[]) => JournalEntry[]) {
    setEntries((current) => {
      const next = fn(current);
      writeLocalJournal(next);
      return next;
    });
  }

  async function addEntry(entry: Omit<JournalEntry, 'id' | 'createdAt' | 'status'>) {
    const created: JournalEntry = { ...entry, id: newId(), createdAt: new Date().toISOString(), status: 'open' };
    update((current) => [created, ...current]);
  }

  async function closeEntry(id: string, exitPrice: number, lesson?: string) {
    update((current) =>
      current.map((e) => {
        if (e.id !== id) return e;
        const f = closeFields(e, exitPrice, lesson);
        return {
          ...e,
          exitPrice: f.exit_price,
          profitLoss: f.profit_loss,
          profitLossPct: f.profit_loss_pct,
          lessonLearned: f.lesson_learned ?? undefined,
          status: 'closed',
          closedAt: f.closed_at,
        };
      }),
    );
  }

  async function removeEntry(id: string) {
    update((current) => current.filter((e) => e.id !== id));
  }

  const stats: JournalStats = journalStats(entries);
  return { entries, loading, error, addEntry, closeEntry, removeEntry, stats, reload: load };
}
