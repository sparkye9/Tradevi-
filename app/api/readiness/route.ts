import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { readinessBoard } from '@/lib/readinessBoard';

export const runtime = 'nodejs';
// Ten instruments × several Yahoo calls can exceed the default function timeout.
export const maxDuration = 60;

/** GET /api/readiness — graded readiness for every instrument in the universe. */
export async function GET(request: Request) {
  const limited = rateLimit(request, 'readiness', { capacity: 20, perMinute: 10 });
  if (limited) return limited;
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('refresh') === '1';
  try {
    const board = await readinessBoard(force);
    return NextResponse.json(board);
  } catch (e) {
    return NextResponse.json(
      { items: [], errors: [{ instrument: 'ALL', display: 'All instruments', error: e instanceof Error ? e.message : String(e) }], updated_at: new Date().toISOString(), source: 'Yahoo Finance (delayed)' },
      { status: 503 },
    );
  }
}
