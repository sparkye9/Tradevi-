import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/paypal';
import { createAdminClient } from '@/lib/supabase/admin';

// PayPal event types this handler cares about — all carry a subscription
// resource with an `id` matching our stored paypal_subscription_id.
const SUBSCRIPTION_EVENTS = new Set([
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.UPDATED',
]);

/**
 * Keeps the subscriptions table in sync with PayPal's view of the world —
 * this is what makes a cancellation actually lock a user back out, instead
 * of relying only on the one-time check at /api/subscription/link.
 */
export async function POST(request: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error('PAYPAL_WEBHOOK_ID not set — rejecting webhook, cannot verify signature.');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const verified = await verifyWebhookSignature({
    authAlgo: request.headers.get('paypal-auth-algo') ?? '',
    certUrl: request.headers.get('paypal-cert-url') ?? '',
    transmissionId: request.headers.get('paypal-transmission-id') ?? '',
    transmissionSig: request.headers.get('paypal-transmission-sig') ?? '',
    transmissionTime: request.headers.get('paypal-transmission-time') ?? '',
    webhookId,
    webhookEvent: event,
  }).catch(() => false);

  if (!verified) {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 });
  }

  if (SUBSCRIPTION_EVENTS.has(event.event_type)) {
    const subscriptionId: string | undefined = event.resource?.id;
    const status: string | undefined = event.resource?.status;
    if (subscriptionId && status) {
      const admin = createAdminClient();
      const { error } = await admin
        .from('subscriptions')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('paypal_subscription_id', subscriptionId);
      if (error) {
        console.error(`Failed to update subscription ${subscriptionId} from webhook:`, error.message);
      }
    }
  }

  return NextResponse.json({ received: true });
}
