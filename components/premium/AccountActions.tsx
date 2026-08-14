'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function AccountActions({
  isOwner,
  isActive,
  hasPaypal,
}: {
  isOwner: boolean;
  isActive: boolean;
  hasPaypal: boolean;
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [cancelled, setCancelled] = useState(false);

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Not configured.
    }
    router.push('/');
    router.refresh();
  }

  async function handleCancel() {
    if (!confirm('Cancel your Tradevi subscription? Access ends as soon as PayPal confirms.')) {
      return;
    }
    setError('');
    setCancelling(true);
    try {
      const res = await fetch('/api/subscription/cancel', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Could not cancel the subscription.');
        return;
      }
      setCancelled(true);
      router.refresh();
    } catch {
      setError('Could not cancel the subscription right now.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4">
      {cancelled && (
        <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          Subscription cancelled. You can resubscribe anytime from{' '}
          <Link href="/subscribe" className="underline">
            /subscribe
          </Link>
          .
        </div>
      )}
      {error && <div className="text-sm text-red-400">{error}</div>}

      <div className="flex flex-wrap gap-2">
        {!isOwner && isActive && hasPaypal && !cancelled && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="px-4 py-2 text-sm font-semibold text-red-300 border border-red-500/40 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {cancelling ? 'Cancelling...' : 'Cancel subscription'}
          </button>
        )}
        {!isActive && !isOwner && (
          <Link
            href="/subscribe"
            className="px-4 py-2 text-sm font-semibold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 rounded-lg hover:bg-emerald-500/30 transition-colors"
          >
            Subscribe
          </Link>
        )}
        <button
          onClick={handleSignOut}
          className="px-4 py-2 text-sm font-semibold text-gray-300 border border-[#2a2a2a] rounded-lg hover:bg-white/5 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
