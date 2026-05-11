'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JournalEntry } from '@/lib/types';

function genId() { return Math.random().toString(36).substring(2, 11) + Date.now().toString(36); }

interface JournalState {
  entries: JournalEntry[];
  addEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'status'>) => string;
  closeEntry: (id: string, exitPrice: number, lesson?: string) => void;
  updateEntry: (id: string, updates: Partial<JournalEntry>) => void;
  removeEntry: (id: string) => void;
  getOpenEntries: () => JournalEntry[];
  getClosedEntries: () => JournalEntry[];
  getStats: () => { totalTrades: number; wins: number; losses: number; winRate: number; totalPnL: number };
}

export const useJournalStore = create<JournalState>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (entry) => {
        const id = genId();
        set(s => ({
          entries: [{
            ...entry,
            id,
            createdAt: new Date().toISOString(),
            status: 'open' as const,
          }, ...s.entries]
        }));
        return id;
      },
      closeEntry: (id, exitPrice, lesson) => set(s => ({
        entries: s.entries.map(e => {
          if (e.id !== id) return e;
          const pnl = (exitPrice - e.entryPrice) * 100;
          const pnlPct = ((exitPrice - e.entryPrice) / e.entryPrice) * 100;
          return { ...e, exitPrice, profitLoss: Math.round(pnl * 100) / 100, profitLossPct: Math.round(pnlPct * 10) / 10, lessonLearned: lesson, status: 'closed' as const, closedAt: new Date().toISOString() };
        })
      })),
      updateEntry: (id, updates) => set(s => ({
        entries: s.entries.map(e => e.id === id ? { ...e, ...updates } : e)
      })),
      removeEntry: (id) => set(s => ({ entries: s.entries.filter(e => e.id !== id) })),
      getOpenEntries: () => get().entries.filter(e => e.status === 'open'),
      getClosedEntries: () => get().entries.filter(e => e.status === 'closed'),
      getStats: () => {
        const closed = get().entries.filter(e => e.status === 'closed' && e.profitLoss != null);
        const wins = closed.filter(e => (e.profitLoss ?? 0) > 0).length;
        const totalPnL = closed.reduce((sum, e) => sum + (e.profitLoss ?? 0), 0);
        return {
          totalTrades: closed.length,
          wins,
          losses: closed.length - wins,
          winRate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
          totalPnL: Math.round(totalPnL * 100) / 100,
        };
      },
    }),
    { name: 'tradewise-journal' }
  )
);
