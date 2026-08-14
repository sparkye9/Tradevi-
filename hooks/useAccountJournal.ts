'use client';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { JournalEntry } from '@/lib/types';
import {
  LOCAL_JOURNAL_MIGRATED_KEY,
  clearLocalJournal,
  closeFields,
  insertFields,
  journalStats,
  readLocalJournal,
  rowToEntry,
  type JournalStats,
} from '@/lib/journal';

function tableMissing(message: string | undefined): boolean {
  const m = (message ?? '').toLowerCase();
  return m.includes('journal_entries') && (m.includes('does not exist') || m.includes('schema cache') || m.includes('could not find'));
}

export function useAccountJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) {
        setUserId(null);
        setEntries([]);
        setError('Sign in to use the journal.');
        return;
      }
      setUserId(auth.user.id);

      const { data, error: queryError } = await supabase
        .from('journal_entries')
        .select('*')
        .order('created_at', { ascending: false });

      if (queryError) {
        setError(
          tableMissing(queryError.message)
            ? 'Journal storage is not set up on this project yet. Run the journal SQL in supabase/schema.sql.'
            : queryError.message
        );
        setEntries([]);
        return;
      }

      let next = (data ?? []).map(rowToEntry);

      const migratedFor = window.localStorage.getItem(LOCAL_JOURNAL_MIGRATED_KEY);
      const local = readLocalJournal();
      if (next.length === 0 && local.length > 0 && migratedFor !== auth.user.id) {
        const rows = local.map((entry) => insertFields(auth.user.id, {
          ticker: entry.ticker,
          contract: entry.contract,
          entryPrice: entry.entryPrice,
          setup: entry.setup,
          triggerReason: entry.triggerReason,
          emotion: entry.emotion,
          followedRules: entry.followedRules,
          alertId: entry.alertId,
          exitPrice: entry.exitPrice,
          profitLoss: entry.profitLoss,
          profitLossPct: entry.profitLossPct,
          lessonLearned: entry.lessonLearned,
        })).map((base, i) => {
          const src = local[i];
          if (src.status !== 'closed') return base;
          return {
            ...base,
            ...closeFields(src, src.exitPrice ?? src.entryPrice, src.lessonLearned),
            created_at: src.createdAt,
          };
        });
        const { error: migrateError } = await supabase.from('journal_entries').insert(rows);
        if (!migrateError) {
          window.localStorage.setItem(LOCAL_JOURNAL_MIGRATED_KEY, auth.user.id);
          clearLocalJournal();
          const { data: fresh } = await supabase
            .from('journal_entries')
            .select('*')
            .order('created_at', { ascending: false });
          next = (fresh ?? []).map(rowToEntry);
        }
      }

      setEntries(next);
    } catch {
      setError('Journal is not available right now — accounts may not be configured on this deployment.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addEntry(entry: Omit<JournalEntry, 'id' | 'createdAt' | 'status'>) {
    if (!userId) {
      setError('Sign in to use the journal.');
      return;
    }
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from('journal_entries')
      .insert(insertFields(userId, entry))
      .select('*')
      .single();
    if (insertError || !data) {
      setError(insertError?.message ?? 'Could not save that trade.');
      return;
    }
    setEntries((current) => [rowToEntry(data), ...current]);
  }

  async function closeEntry(id: string, exitPrice: number, lesson?: string) {
    const current = entries.find((e) => e.id === id);
    if (!current) return;
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from('journal_entries')
      .update(closeFields(current, exitPrice, lesson))
      .eq('id', id)
      .select('*')
      .single();
    if (updateError || !data) {
      setError(updateError?.message ?? 'Could not close that trade.');
      return;
    }
    const updated = rowToEntry(data);
    setEntries((list) => list.map((e) => (e.id === id ? updated : e)));
  }

  async function removeEntry(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from('journal_entries').delete().eq('id', id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setEntries((list) => list.filter((e) => e.id !== id));
  }

  const stats: JournalStats = journalStats(entries);
  return { entries, loading, error, addEntry, closeEntry, removeEntry, stats, reload: load };
}
