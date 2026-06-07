import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const resp = await fetch(
      'https://api.elections.kalshi.com/trade-api/v2/markets?status=open&limit=5',
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      }
    );

    const status = resp.status;
    const text = await resp.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* raw */ }

    // Show first market's raw fields if available
    const markets = (parsed as Record<string, unknown>)?.markets as unknown[] | undefined;
    const sample = markets?.[0] ?? null;

    return NextResponse.json({
      httpStatus: status,
      marketCount: markets?.length ?? 0,
      sampleMarket: sample,
      rawSnippet: text.slice(0, 500),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 200 });
  }
}
