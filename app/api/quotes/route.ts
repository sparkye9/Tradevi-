import { NextResponse } from 'next/server';
import { fetchYahooQuotes, type YahooQuoteRaw } from '@/lib/yahoo-screener';
import { QUOTE_INSTRUMENTS, classifyQuote, QUOTE_CLASS_LABEL, type Freshness } from '@/lib/quoteFreshness';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface QuoteRow {
  symbol: string;
  name: string;
  cls: string;
  clsLabel: string;
  source: string | null;
  sourceSymbol: string | null;
  price: number | null;
  changePercent: number | null;
  /** ISO time of the last trade per the provider (not server time). */
  quoteTime: string | null;
  freshness: Freshness;
  note?: string;
}

let memo: { ts: number; raw: YahooQuoteRaw[] } | null = null;
const TTL_MS = 30_000;

/**
 * GET /api/quotes — every reference instrument with provider, quote time and
 * freshness. A row that failed, is stale, or has no free feed says so; it is
 * never filled from another instrument or from an old cache silently.
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, 'quotes', { capacity: 30, perMinute: 20 });
  if (limited) return limited;
  const now = new Date();
  const symbols = QUOTE_INSTRUMENTS.map((q) => q.yahoo).filter((s): s is string => Boolean(s));
  let raw: YahooQuoteRaw[] = [];
  let feedError: string | null = null;
  try {
    if (memo && Date.now() - memo.ts < TTL_MS) raw = memo.raw;
    else {
      raw = await fetchYahooQuotes(symbols);
      if (raw.length === 0) throw new Error('Yahoo returned no quotes');
      memo = { ts: Date.now(), raw };
    }
  } catch (e) {
    feedError = e instanceof Error ? e.message : String(e);
  }
  const bySymbol = new Map(raw.map((q) => [q.symbol, q]));

  const rows: QuoteRow[] = QUOTE_INSTRUMENTS.map((inst) => {
    const q = inst.yahoo ? bySymbol.get(inst.yahoo) : undefined;
    const price = q?.regularMarketPrice ?? null;
    const t = q?.regularMarketTime ?? null;
    const freshness: Freshness = !inst.yahoo
      ? { state: 'unavailable', ageMinutes: null, detail: inst.note ?? 'No feed configured.' }
      : feedError
      ? { state: 'unavailable', ageMinutes: null, detail: `Feed disconnected: ${feedError}` }
      : classifyQuote({ price, quoteTimeSec: t, now, hours: inst.hours, delayMinutes: q?.exchangeDataDelayedBy ?? null });
    return {
      symbol: inst.symbol,
      name: inst.name,
      cls: inst.cls,
      clsLabel: QUOTE_CLASS_LABEL[inst.cls],
      source: inst.yahoo ? 'Yahoo Finance' : null,
      sourceSymbol: inst.yahoo,
      price: freshness.state === 'unavailable' ? null : price,
      changePercent: freshness.state === 'unavailable' ? null : q?.regularMarketChangePercent ?? null,
      quoteTime: t ? new Date(t * 1000).toISOString() : null,
      freshness,
      note: inst.note,
    };
  });

  return NextResponse.json({ rows, feedError, servedAt: now.toISOString() });
}
