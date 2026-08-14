import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/paypal';

/**
 * Receives PayPal's subscription lifecycle events (activated, cancelled,
 * expired, payment failed, ...). Access control never depends on anything
 * this endpoint stores — subscription status is re-checked live against
 * PayPal on every gate (see app/api/paypal/status/route.ts) because Vercel
 * functions have no durable local database. This endpoint exists so PayPal's
 * webhook delivery succeeds and events are visible in logs.
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

  console.log(`PayPal webhook: ${event.event_type} for resource ${event.resource?.id}`);

  return NextResponse.json({ received: true });
}
