// Client-side proxy to Next.js API routes — browser-safe, no direct Yahoo Finance calls.
// Server-side code (scanner, API routes) imports from lib/yahooFinance.ts or lib/yahooChart.ts directly.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StockQuote, CandleData, OptionContract, NewsItem } from './types';

export type DataSource = 'finnhub_realtime' | 'yahoo_delayed';

async function apiCall(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const resp = await fetch(url.toString(), { cache: 'no-store' });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: 'API request failed' }));
    throw new Error(error.error || `API request failed: ${resp.status}`);
  }
  return resp.json();
}

export async function fetchQuote(symbol: string): Promise<StockQuote & { _dataSource: DataSource; _fetchedAt: string }> {
  const data = await apiCall(`/api/quotes/${symbol}`);
  return {
    symbol:              data.symbol,
    price:               data.price,
    change:              data.change,
    changePercent:       data.changePercent,
    volume:              data.volume              ?? 0,
    avgVolume:           data.avgVolume           ?? 0,
    marketCap:           data.marketCap           ?? 0,
    fiftyTwoWeekHigh:    data.fiftyTwoWeekHigh    ?? 0,
    fiftyTwoWeekLow:     data.fiftyTwoWeekLow     ?? 0,
    regularMarketOpen:   data.open                ?? 0,
    regularMarketDayHigh:data.high                ?? 0,
    regularMarketDayLow: data.low                 ?? 0,
    shortName:           data.shortName           ?? '',
    longName:            data.longName            ?? '',
    _dataSource:         data.dataSource          ?? 'yahoo_delayed',
    _fetchedAt:          data.fetchedAt           ?? new Date().toISOString(),
  };
}

export async function fetchCandles(
  symbol: string, period = '3mo', interval = '1d',
): Promise<{ candles: CandleData[]; dataSource: DataSource }> {
  const data = await apiCall(`/api/charts/${symbol}`, { period, interval });
  return {
    candles:    data.candles    ?? [],
    dataSource: data.dataSource ?? 'yahoo_delayed',
  };
}

export async function fetchOptionsChain(symbol: string, expirationDate?: string): Promise<{
  expirationDates: string[];
  calls: OptionContract[];
  puts: OptionContract[];
  dataSource: DataSource;
}> {
  const params: Record<string, string> = { symbol };
  if (expirationDate) params.expiration = expirationDate;
  const data = await apiCall('/api/options-chain', params);
  return {
    expirationDates: data.expirationDates ?? [],
    calls:           data.calls           ?? [],
    puts:            data.puts            ?? [],
    dataSource:      data.dataSource      ?? 'yahoo_delayed',
  };
}

export async function fetchNews(symbol: string): Promise<NewsItem[]> {
  const data = await apiCall('/api/news', { symbol });
  return data.news ?? [];
}

export async function fetchMultipleQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
  const results = await Promise.allSettled(symbols.map(s => fetchQuote(s)));
  const map: Record<string, StockQuote> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map[symbols[i]] = r.value;
  });
  return map;
}
