import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { liveSetups } from '@/lib/crash/history/liveSetups';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA'];

/** GET /api/crash/setups?symbol=SPY — live put setups with their replay evidence. */
export async function GET(request: Request) {
  const limited = rateLimit(request, 'crash-setups', { capacity: 10, perMinute: 6 });
  if (limited) return limited;
  const s = (new URL(request.url).searchParams.get('symbol') ?? 'SPY').toUpperCase();
  const symbol = SYMBOLS.includes(s) ? s : 'SPY';
  try {
    return NextResponse.json({ symbol, ...(await liveSetups(symbol)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
