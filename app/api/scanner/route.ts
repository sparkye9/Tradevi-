import { NextRequest, NextResponse } from 'next/server';
import { runScanner } from '@/lib/scanner';

function safeJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  try {
    const filters = (await request.json()) as Record<string, unknown>;
    const result = await runScanner(filters);
    return safeJson(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Scanner request failed';
    return safeJson({
      success: false,
      error: message,
      opportunities: [],
      symbolsScanned: 0,
      scannedAt: new Date().toISOString(),
      totalContractsAnalyzed: 0,
      filters: {},
    }, 503);
  }
}

export async function GET() {
  return safeJson({
    success: false,
    error: 'Scanner requires a POST request with filters.',
    opportunities: [],
    symbolsScanned: 0,
    scannedAt: new Date().toISOString(),
    totalContractsAnalyzed: 0,
    filters: {},
  }, 405);
}
