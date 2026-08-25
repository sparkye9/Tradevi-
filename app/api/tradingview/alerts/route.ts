import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Protected by middleware.ts (not in PUBLIC_API_PREFIXES) — only signed-in
// users reach this. Reads through the user's own session so RLS on
// tv_alerts applies normally.
export async function GET(req: NextRequest) {
  const limitParam = Number(req.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 20;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('tv_alerts')
    .select('id, symbol, message, payload, received_at')
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ alerts: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data ?? [] });
}
