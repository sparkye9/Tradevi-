// Yahoo Finance data fetching with mock fallback
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StockQuote, CandleData, OptionContract, NewsItem } from './types';
import { MOCK_QUOTES, generateMockCandles, generateMockOptionChain, MOCK_NEWS } from './mock';
import { analyzeOptionContract } from './optionsAnalysis';

async function yf(): Promise<any> {
  const mod = await import('yahoo-finance2');
  return mod.default as any;
}

export async function fetchQuote(symbol: string): Promise<StockQuote> {
  try {
    const yahoo = await yf();
    const result = await yahoo.quote(symbol);
    return {
      symbol: result.symbol,
      price: result.regularMarketPrice ?? 0,
      change: result.regularMarketChange ?? 0,
      changePercent: result.regularMarketChangePercent ?? 0,
      volume: result.regularMarketVolume ?? 0,
      avgVolume: result.averageDailyVolume10Day,
      marketCap: result.marketCap,
      fiftyTwoWeekHigh: result.fiftyTwoWeekHigh ?? 0,
      fiftyTwoWeekLow: result.fiftyTwoWeekLow ?? 0,
      regularMarketOpen: result.regularMarketOpen,
      regularMarketDayHigh: result.regularMarketDayHigh,
      regularMarketDayLow: result.regularMarketDayLow,
      shortName: result.shortName,
      longName: result.longName,
    };
  } catch {
    return MOCK_QUOTES[symbol] ?? {
      symbol, price: 100, change: 0, changePercent: 0, volume: 1000000,
      fiftyTwoWeekHigh: 120, fiftyTwoWeekLow: 80,
    };
  }
}

export async function fetchCandles(symbol: string, period = '3mo', interval = '1d'): Promise<CandleData[]> {
  try {
    const yahoo = await yf();
    const validIntervals = ['1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo','3mo'];
    const safeInterval = validIntervals.includes(interval) ? interval : '1d';

    const endDate = new Date();
    const startDate = new Date();
    if (period === '1d') startDate.setDate(endDate.getDate() - 1);
    else if (period === '5d') startDate.setDate(endDate.getDate() - 5);
    else if (period === '1mo') startDate.setMonth(endDate.getMonth() - 1);
    else if (period === '3mo') startDate.setMonth(endDate.getMonth() - 3);
    else if (period === '6mo') startDate.setMonth(endDate.getMonth() - 6);
    else if (period === '1y') startDate.setFullYear(endDate.getFullYear() - 1);
    else startDate.setMonth(endDate.getMonth() - 3);

    const result = await yahoo.chart(symbol, { period1: startDate, period2: endDate, interval: safeInterval });
    const quotes: any[] = result.quotes ?? [];

    return quotes
      .filter((q: any) => q.timestamp && q.open != null && q.close != null)
      .map((q: any) => ({
        time: Math.floor(new Date(q.timestamp).getTime() / 1000),
        open: q.open ?? 0,
        high: q.high ?? 0,
        low: q.low ?? 0,
        close: q.close ?? 0,
        volume: q.volume ?? 0,
      }));
  } catch {
    const basePrice = MOCK_QUOTES[symbol]?.price ?? 100;
    return generateMockCandles(basePrice);
  }
}

export async function fetchOptionsChain(symbol: string, expirationDate?: string): Promise<{
  expirationDates: string[];
  calls: OptionContract[];
  puts: OptionContract[];
}> {
  try {
    const yahoo = await yf();
    const quote = await fetchQuote(symbol);
    const stockPrice = quote.price;
    const queryOpts = expirationDate ? { date: new Date(expirationDate) } : {};
    const result = await yahoo.options(symbol, queryOpts);

    const expirationDates: string[] = (result.expirationDates ?? []).map((d: any) =>
      new Date(d).toISOString().split('T')[0]
    );

    const activeExpiry = expirationDate ?? expirationDates[0];
    const expiryTs = activeExpiry ? new Date(activeExpiry).getTime() : Date.now() + 7 * 86400000;
    const dte = Math.max(0, Math.ceil((expiryTs - Date.now()) / 86400000));

    const rawCalls: any[] = result.options?.[0]?.calls ?? [];
    const rawPuts: any[] = result.options?.[0]?.puts ?? [];

    const mapContract = (raw: any, type: 'call' | 'put'): OptionContract => {
      const bid = raw.bid ?? 0;
      const ask = raw.ask ?? raw.lastPrice ?? 0;
      const iv = raw.impliedVolatility ?? 0.4;
      return analyzeOptionContract({
        contractSymbol: raw.contractSymbol,
        strike: raw.strike,
        expiration: activeExpiry ?? '',
        type, bid, ask: Math.max(ask, bid),
        volume: raw.volume ?? 0,
        openInterest: raw.openInterest ?? 0,
        impliedVolatility: iv, stockPrice, dte,
        lastPrice: raw.lastPrice ?? 0,
        delta: raw.delta, theta: raw.theta,
      });
    };

    return {
      expirationDates,
      calls: rawCalls.map((r: any) => mapContract(r, 'call')),
      puts: rawPuts.map((r: any) => mapContract(r, 'put')),
    };
  } catch {
    const quote = await fetchQuote(symbol);
    const expiry = expirationDate ?? new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    return {
      expirationDates: [
        new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0],
        new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      ],
      calls: generateMockOptionChain(symbol, quote.price, expiry, 'call'),
      puts: generateMockOptionChain(symbol, quote.price, expiry, 'put'),
    };
  }
}

export async function fetchNews(symbol: string): Promise<NewsItem[]> {
  try {
    const yahoo = await yf();
    const result = await yahoo.search(symbol, { newsCount: 8, quotesCount: 0 });
    const newsItems: any[] = result.news ?? [];
    return newsItems.slice(0, 8).map((item: any) => ({
      title: item.title ?? '',
      link: item.link ?? '#',
      publisher: item.publisher ?? 'Unknown',
      publishedAt: item.providerPublishTime
        ? new Date(item.providerPublishTime * 1000).toISOString()
        : new Date().toISOString(),
      summary: item.summary,
    }));
  } catch {
    return MOCK_NEWS[symbol] ?? [
      { title: `Latest news for ${symbol}`, link: '#', publisher: 'Market Data', publishedAt: new Date().toISOString() },
    ];
  }
}

export async function fetchMultipleQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
  const results = await Promise.allSettled(symbols.map(s => fetchQuote(s)));
  const map: Record<string, StockQuote> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map[symbols[i]] = r.value;
  });
  return map;
}
