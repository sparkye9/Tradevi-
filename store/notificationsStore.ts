'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationLevel = 'good' | 'info' | 'warn';

export interface AppNotification {
  id: string;
  symbol: string;
  message: string;
  level: NotificationLevel;
  createdAt: string;
  read: boolean;
}

function genId() {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

interface NotificationsState {
  notifications: AppNotification[];
  // Last score seen per symbol — how the app tells "entered the top 5" and
  // "momentum weakening" apart from "same as last refresh."
  lastScores: Record<string, number>;
  push: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void;
  setLastScores: (scores: Record<string, number>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
  unreadCount: () => number;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      notifications: [],
      lastScores: {},
      push: (n) =>
        set((s) => ({
          notifications: [
            { ...n, id: genId(), createdAt: new Date().toISOString(), read: false },
            ...s.notifications,
          ].slice(0, 50),
        })),
      setLastScores: (scores) => set({ lastScores: scores }),
      markRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      clear: () => set({ notifications: [] }),
      unreadCount: () => get().notifications.filter((n) => !n.read).length,
    }),
    { name: 'tradevi-notifications' }
  )
);
