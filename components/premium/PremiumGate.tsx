'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSubscriptionStore } from '@/store/subscriptionStore';

type CheckState = 'checking' | 'active' | 'inactive' | 'unconfigured';

export default function PremiumGate({ children }: { children: React.ReactNode }) {
  const { subscriptionId, clear } = useSubscriptionStore();
  const [state, setState] = useState<CheckState>('checking');

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!subscriptionId) {
        if (!cancelled) setState('inactive');
        return;
      }
      try {
        const res = await fetch(`/api/paypal/status?subscriptionId=${encodeURIComponent(subscriptionId)}`);
        const json = await res.json();
        if (cancelled) return;
        if (typeof json.error === 'string' && json.error.includes('not configured')) {
          setState('unconfigured');
          return;
        }
        if (json.active) {
          setState('active');
        } else {
          setState('inactive');
          clear();
        }
      } catch {
        if (!cancelled) setState('inactive');
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [subscriptionId, clear]);

  if (state === 'checking') {
    return <div className="text-gray-500 text-sm animate-pulse">Checking subscription...</div>;
  }

  if (state === 'active') {
    return <>{children}</>;
  }

  return (
    <div className="max-w-lg bg-[#111111] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
      <div className="text-2xl">🔒</div>
      <h2 className="text-white font-bold text-lg">Premium feature</h2>
      <p className="text-sm text-gray-400">
        This is part of Tradevi Premium — $7.99/month.
        {state === 'unconfigured' && " Subscriptions aren't configured on this deployment yet."}
      </p>
      <Link
        href="/subscribe"
        className="inline-block px-4 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg text-sm font-semibold hover:bg-emerald-500/30 transition-colors"
      >
        Subscribe with PayPal
      </Link>
    </div>
  );
}
