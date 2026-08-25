import { NextRequest, NextResponse } from 'next/server';
import { fetchFinvizPublicScreener } from '@/lib/finviz-public';
import { fetchYahooScreener } from '@/lib/yahoo-screener';
import { fetchTradierQuotes } from '@/lib/tradier';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

export const runtime = 'nodejs';

// Finviz (and its Yahoo fallback) carry a real quote-refresh delay on top of
// the screener's own cache — Tradier's brokerage feed is real-time, so we
// overlay it onto price/change for any symbol it can answer. Everything
// else on the row (RVOL, SMA, sector, group strength) still comes from the
// screener since Tradier doesn't have those.
async function overlayTradierPrices(result: FinvizResult<FinvizQuote>): Promise<FinvizResult<FinvizQuote>> {
  if (result.data.length === 0) return result;

  const tradier = await fetchTradierQuotes(result.data.map((q) => q.symbol));
  if (tradier.sourceError || tradier.quotes.length === 0) return result;

  const bySymbol = new Map(tradier.quotes.map((q) => [q.symbol, q]));
  const data = result.data.map((q) => {
    const live = bySymbol.get(q.symbol);
    if (!live || live.price === null) return q;
    return {
      ...q,
      price: live.price,
      changePercent: live.changePercent ?? q.changePercent,
      priceSource: 'tradier' as const,
      lastUpdated: live.quoteTime ?? q.lastUpdated,
    };
  });

  return { ...result, data, source: `${result.source ?? 'Finviz'} + Tradier live` };
}

export async function GET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get('tickers') ?? '';
  const tickers = tickersParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ data: [], lastUpdated: new Date().toISOString() });
  }

  // Try Finviz public screener first (same approach as finvizfinance Python library)
  const finvizResult = await fetchFinvizPublicScreener(tickers);
  if (!finvizResult.blocked && !finvizResult.sourceError && finvizResult.data.length > 0) {
    return NextResponse.json(await overlayTradierPrices(finvizResult));
  }

  // Fall back to Yahoo Finance
  const yahooResult = await fetchYahooScreener(tickers);
  return NextResponse.json({
    ...(await overlayTradierPrices(yahooResult)),
    finvizError: finvizResult.sourceError,
  });
}
