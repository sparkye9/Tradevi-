import { NextResponse } from 'next/server';
import { fetchPredictItSource } from '@/lib/market-fetchers';

export const runtime = 'nodejs';

export async function GET() {
  const result = await fetchPredictItSource();
  return NextResponse.json(result);
}
