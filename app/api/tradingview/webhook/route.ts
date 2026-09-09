import { NextResponse } from 'next/server';
import { verifyTradingViewSecret, type TvAlertPayload } from '@/lib/tradingview';
import { createAdminClient } from '@/lib/supabase/admin';

// Public by design (see middleware.ts PUBLIC_API_PREFIXES) — TradingView's
// servers call this with no cookies/session, so it authenticates itself via
// a shared secret carried inside the JSON body instead.
export async function POST(request: Request) {
  if (!process.env.TRADINGVIEW_WEBHOOK_SECRET) {
    console.error('TRADINGVIEW_WEBHOOK_SECRET not set — rejecting webhook.');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  let payload: TvAlertPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!verifyTradingViewSecret(payload)) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  const symbol = String(payload.symbol ?? '').toUpperCase().trim();
  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('tv_alerts').insert({
    symbol,
    message: String(payload.message ?? ''),
    payload,
  });

  if (error) {
    console.error('Failed to store TradingView alert:', error.message);
    return NextResponse.json({ error: 'Storage failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
