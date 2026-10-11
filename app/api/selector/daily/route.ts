import { NextResponse } from 'next/server';
import { selectorView } from '@/lib/selectorData';

export const runtime = 'nodejs';

/** GET /api/selector/daily — today's ranked list (Trade / Watch / Avoid). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('refresh') === '1';
  try {
    return NextResponse.json(await selectorView('daily', { force }));
  } catch (e) {
    return NextResponse.json(
      { view: 'daily', items: [], errors: [{ symbol: 'ALL', display: 'All instruments', error: e instanceof Error ? e.message : String(e) }], updated_at: new Date().toISOString() },
      { status: 503 },
    );
  }
}
