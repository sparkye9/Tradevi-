import { NextResponse } from 'next/server';
import { fetchManifoldSource } from '@/lib/market-fetchers';

export const runtime = 'nodejs';

export async function GET() {
  const result = await fetchManifoldSource();
  return NextResponse.json(result);
}
