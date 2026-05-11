'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuditLogEntry } from '@/lib/types';

function genId() { return Math.random().toString(36).substring(2, 11) + Date.now().toString(36); }

interface AuditState {
  entries: AuditLogEntry[];
  log: (action: string, details: string, category: AuditLogEntry['category'], symbol?: string) => void;
  clear: () => void;
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set) => ({
      entries: [],
      log: (action, details, category, symbol) => set(s => ({
        entries: [{
          id: genId(),
          timestamp: new Date().toISOString(),
          action,
          details,
          category,
          symbol,
        }, ...s.entries].slice(0, 500)
      })),
      clear: () => set({ entries: [] }),
    }),
    { name: 'tradewise-audit' }
  )
);
