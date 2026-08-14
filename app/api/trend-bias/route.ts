import { NextResponse } from 'next/server';
import { trendBiasStack, INSTRUMENT_MAP } from '@/lib/trendBias';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instrument = searchParams.get('instrument') ?? 'MNQ';

  if (!INSTRUMENT_MAP[instrument.toUpperCase()]) {
    return NextResponse.json(
      { error: `Unknown instrument "${instrument}". Supported: ${Object.keys(INSTRUMENT_MAP).join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const result = await trendBiasStack(instrument);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Trend bias engine failed' },
      { status: 503 }
    );
  }
}
