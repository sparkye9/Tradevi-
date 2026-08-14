/**
 * PayPal REST integration for Tradevi Premium subscriptions ($7.99/mo).
 *
 * PayPal is the billing source of truth. After checkout, /api/subscription/link
 * verifies the subscription live and writes a row in Supabase. The webhook
 * (and /api/subscription/cancel) keep that row in sync so middleware can
 * gate the app without calling PayPal on every request.
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

export async function cancelSubscription(subscriptionId: string, reason: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    `${PAYPAL_API_BASE}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
      cache: 'no-store',
    }
  );
  // PayPal returns 204 No Content on success. 422 usually means already cancelled.
  if (!res.ok && res.status !== 204 && res.status !== 422) {
    throw new Error(`PayPal cancel failed: ${res.status}`);
  }
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
