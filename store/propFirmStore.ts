'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { blankRules, type AccountProfile, type AccountRules, type DayRecord, type PayoutRecord } from '@/lib/propFirm';

/**
 * Prop-firm accounts live in this browser's localStorage only — Tradevi has no
 * accounts or server database for them. Use Export to keep a backup.
 */
interface PropFirmState {
  accounts: AccountProfile[];
  selectedId: string | null;
  addAccount: (a: Pick<AccountProfile, 'firm' | 'accountType' | 'label' | 'phase' | 'startingBalance'>) => string;
  updateAccount: (id: string, patch: Partial<Omit<AccountProfile, 'id' | 'rules'>>) => void;
  removeAccount: (id: string) => void;
  select: (id: string | null) => void;
  setRule: <K extends keyof AccountRules>(id: string, key: K, rule: AccountRules[K]) => void;
  upsertDay: (id: string, day: DayRecord) => void;
  removeDay: (id: string, date: string) => void;
  addPayout: (id: string, p: PayoutRecord) => void;
  removePayout: (id: string, index: number) => void;
  importAll: (accounts: AccountProfile[]) => void;
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const mapAcct = (accounts: AccountProfile[], id: string, fn: (a: AccountProfile) => AccountProfile) =>
  accounts.map((a) => (a.id === id ? fn(a) : a));

export const usePropFirmStore = create<PropFirmState>()(
  persist(
    (set) => ({
      accounts: [],
      selectedId: null,
      addAccount: (a) => {
        const id = genId();
        set((s) => ({
          accounts: [...s.accounts, { ...a, id, rules: blankRules(), days: [], payouts: [], unrealizedNow: null, createdAt: new Date().toISOString() }],
          selectedId: id,
        }));
        return id;
      },
      updateAccount: (id, patch) => set((s) => ({ accounts: mapAcct(s.accounts, id, (a) => ({ ...a, ...patch })) })),
      removeAccount: (id) => set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id), selectedId: s.selectedId === id ? null : s.selectedId })),
      select: (id) => set({ selectedId: id }),
      setRule: (id, key, rule) => set((s) => ({ accounts: mapAcct(s.accounts, id, (a) => ({ ...a, rules: { ...a.rules, [key]: rule } })) })),
      upsertDay: (id, day) =>
        set((s) => ({
          accounts: mapAcct(s.accounts, id, (a) => ({
            ...a,
            days: [...a.days.filter((d) => d.date !== day.date), day].sort((x, y) => x.date.localeCompare(y.date)),
          })),
        })),
      removeDay: (id, date) => set((s) => ({ accounts: mapAcct(s.accounts, id, (a) => ({ ...a, days: a.days.filter((d) => d.date !== date) })) })),
      addPayout: (id, p) => set((s) => ({ accounts: mapAcct(s.accounts, id, (a) => ({ ...a, payouts: [...a.payouts, p].sort((x, y) => x.date.localeCompare(y.date)) })) })),
      removePayout: (id, index) => set((s) => ({ accounts: mapAcct(s.accounts, id, (a) => ({ ...a, payouts: a.payouts.filter((_, i) => i !== index) })) })),
      importAll: (accounts) => set({ accounts, selectedId: accounts[0]?.id ?? null }),
    }),
    { name: 'tradevi-propfirm', version: 1 },
  ),
);
