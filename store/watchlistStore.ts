'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WatchlistItem } from '@/lib/types';

interface WatchlistState {
  items: WatchlistItem[];
  addSymbol: (symbol: string, notes?: string) => void;
  removeSymbol: (symbol: string) => void;
  updateNotes: (symbol: string, notes: string) => void;
  setTargetPrice: (symbol: string, price: number) => void;
  hasSymbol: (symbol: string) => boolean;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      items: [],
      addSymbol: (symbol, notes) => {
        if (get().hasSymbol(symbol)) return;
        set(s => ({
          items: [...s.items, { symbol: symbol.toUpperCase(), addedAt: new Date().toISOString(), notes }]
        }));
      },
      removeSymbol: (symbol) => set(s => ({ items: s.items.filter(i => i.symbol !== symbol.toUpperCase()) })),
      updateNotes: (symbol, notes) => set(s => ({
        items: s.items.map(i => i.symbol === symbol ? { ...i, notes } : i)
      })),
      setTargetPrice: (symbol, price) => set(s => ({
        items: s.items.map(i => i.symbol === symbol ? { ...i, targetPrice: price } : i)
      })),
      hasSymbol: (symbol) => get().items.some(i => i.symbol === symbol.toUpperCase()),
    }),
    { name: 'tradewise-watchlist' }
  )
);
