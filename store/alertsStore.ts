'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TradeAlert, AlertState } from '@/lib/types';

interface AlertsState {
  alerts: TradeAlert[];
  addAlert: (alert: TradeAlert) => void;
  updateState: (id: string, state: AlertState, reason?: string) => void;
  updateNotes: (id: string, notes: string) => void;
  removeAlert: (id: string) => void;
  clearAll: () => void;
  getActive: () => TradeAlert[];
  getTriggered: () => TradeAlert[];
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set, get) => ({
      alerts: [],
      addAlert: (alert) => {
        // Deduplicate by symbol+direction+strike+expiration
        const exists = get().alerts.some(a =>
          a.symbol === alert.symbol &&
          a.direction === alert.direction &&
          a.strike === alert.strike &&
          a.expiration === alert.expiration &&
          ['watching', 'triggered', 'trade_window_open'].includes(a.state)
        );
        if (!exists) set(s => ({ alerts: [alert, ...s.alerts].slice(0, 200) }));
      },
      updateState: (id, state, reason) => set(s => ({
        alerts: s.alerts.map(a => a.id === id ? {
          ...a,
          state,
          ...(state === 'triggered' ? { triggeredAt: new Date().toISOString() } : {}),
          ...(state === 'invalidated' ? { invalidationReason: reason, invalidationTime: new Date().toISOString() } : {}),
          ...(state === 'trade_window_open' ? { tradeWindowExpiresAt: new Date(Date.now() + a.tradeWindowMinutes * 60000).toISOString() } : {}),
        } : a)
      })),
      updateNotes: (id, notes) => set(s => ({
        alerts: s.alerts.map(a => a.id === id ? { ...a, notes } : a)
      })),
      removeAlert: (id) => set(s => ({ alerts: s.alerts.filter(a => a.id !== id) })),
      clearAll: () => set({ alerts: [] }),
      getActive: () => get().alerts.filter(a =>
        ['watching', 'triggered', 'trade_window_open', 'reviewed'].includes(a.state)
      ),
      getTriggered: () => get().alerts.filter(a =>
        a.state === 'triggered' || a.state === 'trade_window_open'
      ),
    }),
    { name: 'tradewise-alerts' }
  )
);
