/**
 * Browser API client — calls our own Next.js API routes.
 * Never calls Yahoo Finance, Finnhub, or any external service directly.
 */
import type { OptionContract, ScannerResult } from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    // Try JSON error body first; never surface raw HTML to callers
    const json = await res.json().catch(() => null);
    const msg  = json?.error ?? json?.message ?? json?.detail ?? null;
    throw new Error(msg ?? `Request failed (${res.status} ${res.statusText})`);
  }
  return res.json();
}

export interface QuoteData {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePercent: number;
  volume?: number;
  shortName?: string;
  dataSource: string;
  fetchedAt: string;
}

export interface CandleData {
  time: number;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorData {
  rsi: (number | null)[];
  ema9: (number | null)[];
  ema20: (number | null)[];
  ema50: (number | null)[];
  ema200: (number | null)[];
  macdLine: (number | null)[];
  macdSignal: (number | null)[];
  macdHist: (number | null)[];
  bbUpper: (number | null)[];
  bbMid: (number | null)[];
  bbLower: (number | null)[];
  vwap: (number | null)[];
  stFastDir: number[];
  stFastLine: (number | null)[];
  stSlowDir: number[];
  stSlowLine: (number | null)[];
  aroonUp: (number | null)[];
  aroonDown: (number | null)[];
  aroonOsc: (number | null)[];
  diPlus: (number | null)[];
  diMinus: (number | null)[];
  adx: (number | null)[];
  lrsi: (number | null)[];
  atr: (number | null)[];
}

export interface StockAnalysis {
  price: number;
  rsi: number;
  atr: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  trend: 'bullish' | 'bearish' | 'neutral';
  trendStrength: number;
  support: number;
  resistance: number;
  breakoutTrigger: number;
  breakdownTrigger: number;
  ma20: number;
  ma50: number;
  indicators: IndicatorData;
  orb: { orb_high: number | null; orb_low: number | null };
}

export interface ChartResponse {
  symbol: string;
  period: string;
  interval: string;
  candles: CandleData[];
  analysis: StockAnalysis;
  meta: { dataSource: string; fetchedAt: string; delayNote?: string; count: number };
}

// Re-export from lib/types so callers don't need two imports
export type { OptionContract };

export interface OptionsChainResponse {
  success?: boolean;
  symbol: string;
  calls: OptionContract[];
  puts: OptionContract[];
  expirationDates: string[];   // YYYY-MM-DD strings (backward compat)
  expirations: string[];        // alias — same data
  selectedExpiration?: string | null;
  dte?: number | null;
  underlyingPrice: number;
  ivAtm?: number | null;
  historicalVolatility?: number | null;
  ivRank?: number | null;
  expectedMove?: number | null;
  putCallRatio?: number | null;
  meta: { dataSource: string; fetchedAt: string; delayNote?: string };
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

export const fetchQuote = (symbol: string) =>
  apiFetch<QuoteData>(`/api/quotes/${symbol}`);

export const fetchNews = (symbol: string) =>
  apiFetch<{ news: Array<{ title: string; link: string; publisher: string; publishedAt: number; summary: string }> }>(
    `/api/quotes/${symbol}/news`
  );

// ─── Charts ──────────────────────────────────────────────────────────────────

export const fetchChart = (symbol: string, period = '3mo', interval = '') =>
  apiFetch<ChartResponse>(
    `/api/charts/${symbol}?period=${period}${interval ? `&interval=${interval}` : ''}&indicators=true`
  );

// ─── Options ─────────────────────────────────────────────────────────────────

export const fetchOptionsChain = (symbol: string, expiration?: string) =>
  apiFetch<OptionsChainResponse>(
    `/api/options-chain?symbol=${encodeURIComponent(symbol)}${expiration ? `&expiration=${encodeURIComponent(expiration)}` : ''}`
  );

export const fetchMarketNews = () => apiFetch<{ success: boolean; sources: Array<{ name: string; status: string; count: number; error?: string }>; articles: Array<{ title: string; source: string; url: string; publishedAt: string; summary: string }>; fetchedAt: string; error?: string }>(
  '/api/market-news'
);

// ─── Scanner ─────────────────────────────────────────────────────────────────

export const runScanner = (filters: unknown = {}) =>
  apiFetch<ScannerResult>(
    '/api/scanner',
    { method: 'POST', body: JSON.stringify(filters as Record<string, unknown>) }
  );

// ─── Broker ──────────────────────────────────────────────────────────────────

export const fetchBrokerAccount = () => apiFetch('/api/broker/account');
export const fetchPositions = () => apiFetch('/api/broker/positions');
export const fetchOrders = () => apiFetch('/api/broker/orders');

// ─── Alerts ──────────────────────────────────────────────────────────────────

export const fetchAlerts = () => apiFetch('/api/alerts');
export const createAlert = (data: unknown) =>
  apiFetch('/api/alerts', { method: 'POST', body: JSON.stringify(data) });
export const deleteAlert = (id: string) =>
  apiFetch(`/api/alerts/${id}`, { method: 'DELETE' });
