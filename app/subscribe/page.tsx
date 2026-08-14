'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSubscriptionStore } from '@/store/subscriptionStore';

declare global {
  interface Window {
    paypal?: any;
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
const PLAN_ID = process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID;

export default function SubscribePage() {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const { subscriptionId, setSubscription } = useSubscriptionStore();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [restoreId, setRestoreId] = useState('');
  const [restoreState, setRestoreState] = useState<'idle' | 'checking' | 'invalid'>('idle');

  useEffect(() => {
    if (!CLIENT_ID || !PLAN_ID) return;
    if (subscriptionId) return;

    function renderButton() {
      if (!window.paypal || !buttonRef.current) return;
      buttonRef.current.innerHTML = '';
      window.paypal
        .Buttons({
          style: { shape: 'pill', color: 'gold', layout: 'vertical', label: 'subscribe' },
          createSubscription: (_data: unknown, actions: any) =>
            actions.subscription.create({ plan_id: PLAN_ID }),
          onApprove: (data: { subscriptionID: string }) => {
            setSubscription(data.subscriptionID);
            setStatus('success');
          },
          onError: (err: unknown) => {
            setErrorMsg(err instanceof Error ? err.message : 'PayPal checkout failed.');
            setStatus('error');
          },
        })
        .render(buttonRef.current);
    }

    const scriptId = 'paypal-sdk';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://www.paypal.com/sdk/js?client-id=${CLIENT_ID}&vault=true&intent=subscription`;
      script.setAttribute('data-sdk-integration-source', 'button-factory');
      script.onload = renderButton;
      document.body.appendChild(script);
    } else {
      renderButton();
    }
  }, [subscriptionId, setSubscription]);

  async function handleRestore() {
    const id = restoreId.trim();
    if (!id) return;
    setRestoreState('checking');
    try {
      const res = await fetch(`/api/paypal/status?subscriptionId=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (json.active) {
        setSubscription(id);
        setStatus('success');
        setRestoreState('idle');
      } else {
        setRestoreState('invalid');
      }
    } catch {
      setRestoreState('invalid');
    }
  }

  if (!CLIENT_ID || !PLAN_ID) {
    return (
      <div className="max-w-lg space-y-3">
        <h1 className="text-2xl font-bold text-white">Subscribe</h1>
        <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          PayPal isn&apos;t configured on this deployment yet. Set{' '}
          <code className="text-amber-200">NEXT_PUBLIC_PAYPAL_CLIENT_ID</code> and{' '}
          <code className="text-amber-200">NEXT_PUBLIC_PAYPAL_PLAN_ID</code> (plus the backend{' '}
          <code className="text-amber-200">PAYPAL_CLIENT_ID</code> /{' '}
          <code className="text-amber-200">PAYPAL_CLIENT_SECRET</code> pair) — see the Subscriptions setup
          guide in the README.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Tradevi Premium</h1>
        <p className="text-sm text-gray-500 mt-1">
          $7.99/month — unlocks the Trend Bias Stack engine and future premium tools.
        </p>
      </div>

      {subscriptionId && status !== 'success' ? (
        <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
          You already have a subscription on file.{' '}
          <a href="/trend-bias" className="underline">
            Go to Trend Bias Stack
          </a>
          .
        </div>
      ) : status === 'success' ? (
        <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
          <div>Subscription active. Welcome to Premium.</div>
          <button
            onClick={() => router.push('/trend-bias')}
            className="px-4 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg text-sm font-semibold hover:bg-emerald-500/30 transition-colors"
          >
            Go to Trend Bias Stack
          </button>
        </div>
      ) : (
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-2xl p-5 space-y-3">
          <div ref={buttonRef} />
          {status === 'error' && <div className="text-red-400 text-xs">{errorMsg}</div>}
          <p className="text-xs text-gray-600">
            Billed and processed by PayPal. Cancel anytime from your PayPal account. Payment processing fees
            apply to every charge — see the Subscriptions guide for the real numbers.
          </p>
        </div>
      )}

      {status !== 'success' && !subscriptionId && (
        <div className="border-t border-[#1e1e1e] pt-4 space-y-2">
          <p className="text-xs text-gray-500">
            Already subscribed on another device? Access is checked per-browser — paste your PayPal
            subscription ID (starts with <code className="text-gray-400">I-</code>, from your PayPal
            confirmation email) to unlock this one.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={restoreId}
              onChange={(e) => setRestoreId(e.target.value)}
              placeholder="I-XXXXXXXXXXXX"
              className="flex-1 bg-[#111] border border-[#2a2a2a] rounded px-2 py-1.5 text-white text-sm font-mono"
            />
            <button
              onClick={handleRestore}
              disabled={restoreState === 'checking'}
              className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white rounded text-sm disabled:opacity-50"
            >
              {restoreState === 'checking' ? 'Checking...' : 'Unlock'}
            </button>
          </div>
          {restoreState === 'invalid' && (
            <div className="text-red-400 text-xs">Not an active subscription. Check the ID and try again.</div>
          )}
        </div>
      )}
    </div>
  );
}
