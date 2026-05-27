import { NextResponse } from 'next/server';
import { authenticateStockCharts, getCachedSession } from '@/lib/stockcharts-auth';

const SESSION_TTL = 55 * 60 * 1000;

export async function GET() {
  const email = process.env.STOCKCHARTS_EMAIL;
  if (!email) {
    return NextResponse.json({ authenticated: false, error: 'STOCKCHARTS_EMAIL not configured' });
  }

  const session = await authenticateStockCharts();
  const cached  = getCachedSession();
  return NextResponse.json({
    authenticated: !!session,
    email:         session ? email : null,
    cachedUntil:   cached ? new Date(cached.ts + SESSION_TTL).toISOString() : null,
  });
}
