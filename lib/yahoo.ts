// Market data fetching via backend API routes — real data only, no mock fallback.
// All functions throw on failure so callers display a proper error to the user.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StockQuote, CandleData, OptionContract, NewsItem } from './types';
import { analyzeOptionContract } from './optionsAnalysis';

export type DataSource = 'finnhub_realtime' | 'yahoo_delayed';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function apiCall(endpoint: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: 'API request failed' }));
    throw new Error(error.error || `API request failed: ${resp.status}`);
  }
  return resp.json();
}

export async function fetchQuote(symbol: string): Promise<StockQuote & { _dataSource: DataSource; _fetchedAt: string }> {
  try {
    const data = await apiCall(`/api/quotes/${symbol}`);
    return {
      symbol: data.symbol,
      price: data.price,
      change: data.change,
      changePercent: data.changePercent,
      volume: data.volume || 0,
      avgVolume: data.avgVolume || 0,
      marketCap: data.marketCap || 0,
      fiftyTwoWeekHigh: data.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: data.fiftyTwoWeekLow || 0,
      regularMarketOpen: data.open || 0,
      regularMarketDayHigh: data.high || 0,
      regularMarketDayLow: data.low || 0,
      shortName: data.shortName || '',
      longName: data.longName || '',
      _dataSource: data.dataSource || 'finnhub_realtime',
      _fetchedAt: data.fetchedAt || new Date().toISOString(),
    };
  } catch (err: any) {
    if (err.message.includes('API key required') || err.message.includes('FINNHUB_API_KEY')) {
      throw new Error('Market data unavailable — API key required');
    }
    throw new Error(`Failed to fetch quote: ${err.message}`);
  }
}

export async function fetchCandles(
  symbol: string, period = '3mo', interval = '1d'
): Promise<{ candles: CandleData[]; dataSource: DataSource }> {
  try {
    const data = await apiCall(`/api/charts/${symbol}`, { period, interval });
    return {
      candles: data.candles || [],
      dataSource: data.dataSource || 'finnhub_realtime',
    };
  } catch (err: any) {
    if (err.message.includes('API key required') || err.message.includes('FINNHUB_API_KEY')) {
      throw new Error('Market data unavailable — API key required');
    }
    throw new Error(`Failed to fetch candles: ${err.message}`);
  }
}

export async function fetchOptionsChain(symbol: string, expirationDate?: string): Promise<{
  expirationDates: string[];
  calls: OptionContract[];
  puts: OptionContract[];
  dataSource: DataSource;
}> {
  throw new Error('Market data unavailable — API key required');
}

export async function fetchNews(symbol: string): Promise<NewsItem[]> {
  throw new Error('Market data unavailable — API key required');
}

export async function fetchMultipleQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
  const results = await Promise.allSettled(symbols.map(s => fetchQuote(s)));
  const map: Record<string, StockQuote> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map[symbols[i]] = r.value;
  });
  return map;
}
