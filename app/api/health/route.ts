import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Reports which data providers are configured, not whether they're currently
// reachable — a quick way to see "why is this page on the delayed fallback"
// without digging through env vars. No secrets are exposed, only booleans.
export async function GET() {
  const finviz = process.env.FINVIZ_SESSION_COOKIE
    ? 'session_cookie'
    : process.env.FINVIZ_EMAIL && process.env.FINVIZ_PASSWORD
    ? 'email_password'
    : 'not_configured';

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    tradier: Boolean(process.env.TRADIER_TOKEN),
    finviz,
    tradingviewWebhook: Boolean(process.env.TRADINGVIEW_WEBHOOK_SECRET),
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
}
