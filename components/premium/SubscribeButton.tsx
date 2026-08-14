'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    paypal?: any;
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
const PLAN_ID = process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID;

export default function SubscribeButton() {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'linking' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!CLIENT_ID || !PLAN_ID) return;

    async function linkSubscription(subscriptionID: string) {
      setStatus('linking');
      try {
        const res = await fetch('/api/subscription/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptionId: subscriptionID }),
        });
        const json = await res.json();
        if (!res.ok || !json.active) {
          setErrorMsg(json.error ?? 'Subscription is not active yet.');
          setStatus('error');
          return;
        }
        setStatus('success');
        router.refresh();
      } catch {
        setErrorMsg('Could not confirm the subscription. Refresh and check /subscribe again.');
        setStatus('error');
      }
    }

    function renderButton() {
      if (!window.paypal || !buttonRef.current) return;
      buttonRef.current.innerHTML = '';
      window.paypal
        .Buttons({
          style: { shape: 'pill', color: 'gold', layout: 'vertical', label: 'subscribe' },
          createSubscription: (_data: unknown, actions: any) =>
            actions.subscription.create({ plan_id: PLAN_ID }),
          onApprove: (data: { subscriptionID: string }) => linkSubscription(data.subscriptionID),
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
  }, [router]);

  if (!CLIENT_ID || !PLAN_ID) {
    return (
      <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
        Payments aren&apos;t available on this deployment yet. Please try again later.
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
        <div>Subscription active. You have full access.</div>
        <button
          onClick={() => router.push('/futures')}
          className="px-4 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg text-sm font-semibold hover:bg-emerald-500/30 transition-colors"
        >
          Go to Futures
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#111111] border border-[#2a2a2a] rounded-2xl p-5 space-y-3">
      <div ref={buttonRef} />
      {status === 'linking' && <div className="text-gray-500 text-xs animate-pulse">Confirming subscription...</div>}
      {status === 'error' && <div className="text-red-400 text-xs">{errorMsg}</div>}
      <p className="text-xs text-gray-600">
        Billed and processed by PayPal. Cancel anytime from your PayPal account.
      </p>
    </div>
  );
}
