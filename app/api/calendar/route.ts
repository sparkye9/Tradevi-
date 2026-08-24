import { NextResponse } from 'next/server';
import { fetchEconomicCalendar } from '@/lib/economicCalendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await fetchEconomicCalendar();
  return NextResponse.json(result);
}
