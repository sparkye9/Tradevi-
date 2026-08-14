import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSubscription, ACTIVE_STATUSES } from '@/lib/paypal';

/**
 * Called from the browser right after a PayPal Subscribe button approval.
 * Verifies the subscription is real (live PayPal lookup, not trusting the
 * client) and attaches it to the signed-in Supabase user.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const subscriptionId = body?.subscriptionId;
  if (!subscriptionId || typeof subscriptionId !== 'string') {
    return NextResponse.json({ error: 'subscriptionId is required' }, { status: 400 });
  }

  let sub;
  try {
    sub = await getSubscription(subscriptionId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'PayPal lookup failed' },
      { status: 502 }
    );
  }

  const { error: upsertError } = await supabase.from('subscriptions').upsert(
    {
      user_id: user.id,
      paypal_subscription_id: sub.id,
      status: sub.status,
      plan_id: sub.planId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ active: ACTIVE_STATUSES.has(sub.status), status: sub.status });
}
