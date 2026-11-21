import { NextResponse } from 'next/server';
import { equitySession } from '@/lib/marketData/session';
import { collectSnapshot } from '@/lib/crash/snapshots';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/crash/snapshot — records today's put chains into Supabase.
 * Called by Vercel Cron (vercel.json), which sends
 * "Authorization: Bearer <CRON_SECRET>". Without CRON_SECRET set the route
 * refuses, so nobody on the open site can trigger Tradier calls.
 * Only records between 3:30 and 4:15 PM ET on trading days unless ?force=1.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not set — snapshot recording disabled' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase not configured — nowhere to store snapshots' }, { status: 503 });
  }
  const now = new Date();
  const sess = equitySession(now);
  const force = new URL(request.url).searchParams.get('force') === '1';
  const inWindow = sess.tradingDay && sess.minutesEt >= 15 * 60 + 30 && sess.minutesEt <= 16 * 60 + 15;
  if (!inWindow && !force) return NextResponse.json({ skipped: true, reason: `Outside the 3:30–4:15 PM ET window (now ${sess.session}, ${sess.todayEt})` });

  const { rows, errors } = await collectSnapshot(sess.todayEt, now);
  if (!rows.length) return NextResponse.json({ stored: 0, errors }, { status: errors.length ? 502 : 200 });
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  let stored = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from('crash_option_snapshots').upsert(chunk, { onConflict: 'trade_date,option_symbol' });
    if (error) {
      errors.push(`Supabase: ${error.message}`);
      break;
    }
    stored += chunk.length;
  }
  return NextResponse.json({ stored, tradeDate: sess.todayEt, errors });
}
