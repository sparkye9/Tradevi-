import { NextResponse } from 'next/server';
import { selectorView } from '@/lib/selectorData';

export const runtime = 'nodejs';
// Ten instruments × several Yahoo calls can exceed the default function timeout.
export const maxDuration = 60;

/** GET /api/selector/weekly — top 3 for the week plus the full weekly ranking. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('refresh') === '1';
  try {
    return NextResponse.json(await selectorView('weekly', { force }));
  } catch (e) {
    return NextResponse.json(
      { view: 'weekly', items: [], top3: [], errors: [{ symbol: 'ALL', display: 'All instruments', error: e instanceof Error ? e.message : String(e) }], updated_at: new Date().toISOString() },
      { status: 503 },
    );
  }
}
