import { NextRequest, NextResponse } from 'next/server';
import { fetchNews } from '@/lib/yahoo';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase() ?? 'SPY';

  try {
    const news = await fetchNews(symbol);
    return NextResponse.json({ symbol, news }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}
