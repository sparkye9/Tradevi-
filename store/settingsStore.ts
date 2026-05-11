'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Settings {
  accountSize: number;
  maxRiskPercent: number;
  soundEnabled: boolean;
  quietMode: boolean;
  notificationsEnabled: boolean;
  defaultMaxPremium: number;
  defaultTradeType: 'day' | 'swing' | 'both';
  defaultOptionType: 'calls' | 'puts' | 'both';
  showDisclaimer: boolean;
  focusTimerMinutes: number;
  darkMode: boolean;
}

interface SettingsState extends Settings {
  update: (updates: Partial<Settings>) => void;
  reset: () => void;
}

const defaults: Settings = {
  accountSize: 5000,
  maxRiskPercent: 1,
  soundEnabled: false,
  quietMode: false,
  notificationsEnabled: false,
  defaultMaxPremium: 100,
  defaultTradeType: 'swing',
  defaultOptionType: 'both',
  showDisclaimer: true,
  focusTimerMinutes: 25,
  darkMode: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      update: (updates) => set(s => ({ ...s, ...updates })),
      reset: () => set(defaults),
    }),
    { name: 'tradewise-settings' }
  )
);
