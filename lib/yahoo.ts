// Yahoo Finance data fetching with mock fallback.
// All functions attach _dataSource so callers know whether they got real or demo data.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StockQuote, CandleData, OptionContract, NewsItem } from './types';
import { MOCK_QUOTES, generateMockCandles, generateMockOptionChain, MOCK_NEWS } from './mock';
import { analyzeOptionContract } from './optionsAnalysis';

export type DataSource = 'yahoo_delayed' | 'mock';

export interface QuoteWithSource extends StockQuote {
  _dataSource: DataSource;
  _fetchedAt: string;
}

async function yf(): Promise<any> {
  const mod = await import('yahoo-finance2');
  return mod.default as any;
}

function mockQuote(symbol: string, dataSource: DataSource = 'mock'): QuoteWithSource {
  const base = MOCK_QUOTES[symbol] ?? {
    symbol, price: 100, change: 0, changePercent: 0, volume: 1000000,
    fiftyTwoWeekHigh: 120, fiftyTwoWeekLow: 80,
  };
  return { ...base, _dataSource: dataSource, _fetchedAt: new Date().toISOString() };
}

export async function fetchQuote(symbol: string): Promise<QuoteWithSource> {
  try {
    const yahoo = await yf();
    const result = await yahoo.quote(symbol);
    if (!result?.regularMarketPrice) throw new Error('Empty response');
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
      _dataSource: 'yahoo_delayed',
      _fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    console.error(`[TradeWise] Yahoo Finance quote FAILED for ${symbol}: ${err?.message ?? err} — serving mock data`);
    return mockQuote(symbol);
  }
}

export async function fetchCandles(
  symbol: string, period = '3mo', interval = '1d'
): Promise<{ candles: CandleData[]; dataSource: DataSource }> {
  try {
    const yahoo = await yf();
    const validIntervals = ['1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo','3mo'];
    const safeInterval = validIntervals.includes(interval) ? interval : '1d';

    const endDate = new Date();
    const startDate = new Date();
    if (period === '1d')       startDate.setDate(endDate.getDate() - 1);
    else if (period === '5d')  startDate.setDate(endDate.getDate() - 5);
    else if (period === '1mo') startDate.setMonth(endDate.getMonth() - 1);
    else if (period === '3mo') startDate.setMonth(endDate.getMonth() - 3);
    else if (period === '6mo') startDate.setMonth(endDate.getMonth() - 6);
    else if (period === '1y')  startDate.setFullYear(endDate.getFullYear() - 1);
    else                       startDate.setMonth(endDate.getMonth() - 3);

    const result = await yahoo.chart(symbol, { period1: startDate, period2: endDate, interval: safeInterval });
    const quotes: any[] = result.quotes ?? [];
    if (quotes.length === 0) throw new Error('Empty chart response');

    const candles = quotes
      .filter((q: any) => q.timestamp && q.open != null && q.close != null)
      .map((q: any) => ({
        time: Math.floor(new Date(q.timestamp).getTime() / 1000),
        open: q.open ?? 0,
        high: q.high ?? 0,
        low: q.low ?? 0,
        close: q.close ?? 0,
        volume: q.volume ?? 0,
      }));

    return { candles, dataSource: 'yahoo_delayed' };
  } catch (err: any) {
    console.error(`[TradeWise] Yahoo Finance chart FAILED for ${symbol}: ${err?.message ?? err} — serving mock candles`);
    const basePrice = MOCK_QUOTES[symbol]?.price ?? 100;
    return { candles: generateMockCandles(basePrice), dataSource: 'mock' };
  }
}

export async function fetchOptionsChain(symbol: string, expirationDate?: string): Promise<{
  expirationDates: string[];
  calls: OptionContract[];
  puts: OptionContract[];
  dataSource: DataSource;
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
      dataSource: 'yahoo_delayed',
    };
  } catch (err: any) {
    console.error(`[TradeWise] Yahoo Finance options FAILED for ${symbol}: ${err?.message ?? err} — serving mock chain`);
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
      dataSource: 'mock',
    };
  }
}

export async function fetchNews(symbol: string): Promise<NewsItem[]> {
  try {
    const yahoo = await yf();
    const result = await yahoo.search(symbol, { newsCount: 8, quotesCount: 0 });
    const newsItems: any[] = result.news ?? [];
    if (newsItems.length === 0) throw new Error('No news returned');
    return newsItems.slice(0, 8).map((item: any) => ({
      title: item.title ?? '',
      link: item.link ?? '#',
      publisher: item.publisher ?? 'Unknown',
      publishedAt: item.providerPublishTime
        ? new Date(item.providerPublishTime * 1000).toISOString()
        : new Date().toISOString(),
      summary: item.summary,
    }));
  } catch (err: any) {
    console.error(`[TradeWise] Yahoo Finance news FAILED for ${symbol}: ${err?.message ?? err}`);
    return MOCK_NEWS[symbol] ?? [
      { title: `${symbol} — live news unavailable`, link: '#', publisher: 'Demo Data', publishedAt: new Date().toISOString() },
    ];
  }
}

export async function fetchMultipleQuotes(symbols: string[]): Promise<Record<string, QuoteWithSource>> {
  const results = await Promise.allSettled(symbols.map(s => fetchQuote(s)));
  const map: Record<string, QuoteWithSource> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map[symbols[i]] = r.value;
  });
  return map;
}
