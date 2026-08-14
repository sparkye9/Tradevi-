import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cancelSubscription } from '@/lib/paypal';
import { isOwnerEmail } from '@/lib/ownerAccess';

/**
 * Cancels the signed-in user's PayPal subscription and marks the row
 * CANCELLED. Webhook remains the backup if they cancel from PayPal itself.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  if (isOwnerEmail(user.email)) {
    return NextResponse.json({ error: 'Owner accounts have no PayPal subscription to cancel.' }, { status: 400 });
  }

  const { data: row } = await supabase
    .from('subscriptions')
    .select('paypal_subscription_id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!row?.paypal_subscription_id) {
    return NextResponse.json({ error: 'No PayPal subscription is attached to this account.' }, { status: 400 });
  }

  try {
    await cancelSubscription(row.paypal_subscription_id, 'Cancelled from Tradevi account page');
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'PayPal cancel failed' },
      { status: 502 }
    );
  }

  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ cancelled: true, status: 'CANCELLED' });
}
