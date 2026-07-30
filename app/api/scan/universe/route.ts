import { NextRequest, NextResponse } from 'next/server';
import { getUniverseScan } from '@/lib/universe';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic'; // always re-evaluate cache freshness, never statically cached

export async function GET(req: NextRequest) {
  const rvolThreshold = Number(req.nextUrl.searchParams.get('rvolThreshold') ?? 1.5);
  // ?fresh=true bypasses the persisted daily scan and forces a live re-scan.
  const forceFresh = req.nextUrl.searchParams.get('fresh') === 'true';
  const result = await getUniverseScan(rvolThreshold, { maxAgeMinutes: forceFresh ? 0 : undefined });
  return NextResponse.json(result);
}
