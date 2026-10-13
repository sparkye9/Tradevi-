'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Daily command-center state. Lives in this browser only (localStorage). */

export const PREMARKET_ITEMS = [
  { key: 'calendar', label: 'Economic calendar reviewed' },
  { key: 'news', label: 'Major news identified' },
  { key: 'session', label: 'Market session identified' },
  { key: 'levels', label: 'Previous-day levels marked' },
  { key: 'bias', label: 'Higher-timeframe bias established' },
  { key: 'liquidity', label: 'Liquidity zones identified' },
  { key: 'scenarios', label: 'Trade scenarios documented' },
  { key: 'drawdown', label: 'Account drawdown checked' },
  { key: 'risk', label: 'Maximum daily risk set' },
] as const;
export type PremarketKey = (typeof PREMARKET_ITEMS)[number]['key'];

export interface DayPlan {
  date: string;
  checks: Partial<Record<PremarketKey, boolean>>;
  maxDailyRisk: number | null;
  scenarios: string;
  bias: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  instrument: string;
  direction: 'long' | 'short';
  contracts: number;
  entry: number | null;
  exit: number | null;
  stop: number | null;
  pnl: number | null;
  setupType: string;
  entryReason: string;
  exitReason: string;
  followedRules: boolean;
  mistakes: string;
  lessons: string;
  /** Small data-URL screenshots (resized in the browser). */
  screenshots: string[];
  accountId: string | null;
  createdAt: string;
}

interface WorkspaceState {
  phEntry: string;
  phExit: string;
  phInstrument: string;
  setPowerHour: (p: Partial<{ phEntry: string; phExit: string; phInstrument: string }>) => void;
  plans: Record<string, DayPlan>;
  updatePlan: (date: string, patch: Partial<DayPlan>) => void;
  journal: JournalEntry[];
  addJournal: (e: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
  updateJournal: (id: string, patch: Partial<JournalEntry>) => void;
  removeJournal: (id: string) => void;
}

export const DEFAULT_PH_ENTRY = '14:38-14:45';
export const DEFAULT_PH_EXIT = '15:15-15:20';

function emptyPlan(date: string): DayPlan {
  return { date, checks: {}, maxDailyRisk: null, scenarios: '', bias: '' };
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      phEntry: DEFAULT_PH_ENTRY,
      phExit: DEFAULT_PH_EXIT,
      phInstrument: 'MNQ',
      setPowerHour: (p) => set(p),
      plans: {},
      updatePlan: (date, patch) =>
        set((s) => {
          const plans = { ...s.plans, [date]: { ...(s.plans[date] ?? emptyPlan(date)), ...patch } };
          // Keep the last 60 days.
          const keys = Object.keys(plans).sort();
          for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete plans[k];
          return { plans };
        }),
      journal: [],
      addJournal: (e) =>
        set((s) => ({ journal: [{ ...e, id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), createdAt: new Date().toISOString() }, ...s.journal].slice(0, 1000) })),
      updateJournal: (id, patch) => set((s) => ({ journal: s.journal.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),
      removeJournal: (id) => set((s) => ({ journal: s.journal.filter((j) => j.id !== id) })),
    }),
    { name: 'tradevi-workspace', version: 1 },
  ),
);
