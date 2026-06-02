import { NextResponse } from 'next/server';
import { fetchFinvizFutures } from '@/lib/finviz';

export const runtime = 'nodejs';

export async function GET() {
  const result = await fetchFinvizFutures();
  return NextResponse.json(result);
}
