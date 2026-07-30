import { NextRequest, NextResponse } from 'next/server';
import { runUniverseScan } from '@/lib/universe';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic'; // always run a fresh scan (or hit our own in-memory cache), never statically cached

export async function GET(req: NextRequest) {
  const rvolThreshold = Number(req.nextUrl.searchParams.get('rvolThreshold') ?? 1.5);
  const result = await runUniverseScan(rvolThreshold);
  return NextResponse.json(result);
}
