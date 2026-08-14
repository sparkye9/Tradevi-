'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SubscriptionState {
  subscriptionId: string | null;
  setSubscription: (id: string) => void;
  clear: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      subscriptionId: null,
      setSubscription: (id) => set({ subscriptionId: id }),
      clear: () => set({ subscriptionId: null }),
    }),
    { name: 'tradevi-subscription' }
  )
);
