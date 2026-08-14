/**
 * PayPal REST integration for Tradevi Premium subscriptions ($7.99/mo).
 *
 * There is no local subscriber database — Vercel serverless functions have
 * no durable disk. PayPal itself is the source of truth: a subscription's
 * status is looked up live on every access check (see
 * app/api/paypal/status/route.ts). The webhook endpoint exists so PayPal's
 * dashboard validation succeeds and events are logged, but access control
 * never depends on anything cached locally.
 */

const PAYPAL_API_BASE =
  process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

export const ACTIVE_STATUSES = new Set(['ACTIVE']);

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new Error('PayPal is not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing)');
  }
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${res.status}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

export interface PayPalSubscription {
  id: string;
  status: string; // APPROVAL_PENDING | APPROVED | ACTIVE | SUSPENDED | CANCELLED | EXPIRED
  planId: string;
  subscriberEmail: string | null;
}

export async function getSubscription(subscriptionId: string): Promise<PayPalSubscription> {
  const token = await getAccessToken();
  const res = await fetch(
    `${PAYPAL_API_BASE}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    throw new Error(`PayPal subscription lookup failed: ${res.status}`);
  }
  const json = await res.json();
  return {
    id: json.id,
    status: json.status,
    planId: json.plan_id,
    subscriberEmail: json.subscriber?.email_address ?? null,
  };
}

export interface WebhookVerificationPayload {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookId: string;
  webhookEvent: unknown;
}

export async function verifyWebhookSignature(payload: WebhookVerificationPayload): Promise<boolean> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: payload.authAlgo,
      cert_url: payload.certUrl,
      transmission_id: payload.transmissionId,
      transmission_sig: payload.transmissionSig,
      transmission_time: payload.transmissionTime,
      webhook_id: payload.webhookId,
      webhook_event: payload.webhookEvent,
    }),
    cache: 'no-store',
  });
  if (!res.ok) return false;
  const json = await res.json();
  return json.verification_status === 'SUCCESS';
}
