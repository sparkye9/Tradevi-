/**
 * Listing-venue normalisation and TradingView symbol resolution.
 *
 * Providers name venues differently (Yahoo: NMS/NYQ/PCX…, Tradier: Q/N/P…).
 * Everything is folded into one canonical code so two providers can be
 * compared, and so a chart link always carries an explicit exchange prefix.
 * A ticker alone is ambiguous: "EA" is Electronic Arts on NASDAQ (delisted
 * 2026) and Energy Absolute on the Stock Exchange of Thailand (SET:EA).
 */

export type CanonicalExchange =
  | 'NASDAQ'
  | 'NYSE'
  | 'NYSE_AMERICAN'
  | 'NYSE_ARCA'
  | 'CBOE_BZX'
  | 'SET'
  | 'CME'
  | 'CME_MINI'
  | 'CBOT'
  | 'CBOT_MINI'
  | 'COMEX'
  | 'NYMEX';

export interface ExchangeInfo {
  code: CanonicalExchange;
  /** Human label shown in the UI. */
  label: string;
  /** TradingView exchange prefix ("NASDAQ:AAPL"). */
  tvPrefix: string;
  /** IANA timezone of the venue's trading calendar. */
  timezone: string;
  /** True when the venue's cash-equity calendar is the US one Tradevi models. */
  usEquityCalendar: boolean;
  currency: string;
}

export const EXCHANGES: Record<CanonicalExchange, ExchangeInfo> = {
  NASDAQ: { code: 'NASDAQ', label: 'NASDAQ', tvPrefix: 'NASDAQ', timezone: 'America/New_York', usEquityCalendar: true, currency: 'USD' },
  NYSE: { code: 'NYSE', label: 'NYSE', tvPrefix: 'NYSE', timezone: 'America/New_York', usEquityCalendar: true, currency: 'USD' },
  // TradingView lists both NYSE American and NYSE Arca under the AMEX prefix (e.g. AMEX:SPY).
  NYSE_AMERICAN: { code: 'NYSE_AMERICAN', label: 'NYSE American', tvPrefix: 'AMEX', timezone: 'America/New_York', usEquityCalendar: true, currency: 'USD' },
  NYSE_ARCA: { code: 'NYSE_ARCA', label: 'NYSE Arca', tvPrefix: 'AMEX', timezone: 'America/New_York', usEquityCalendar: true, currency: 'USD' },
  CBOE_BZX: { code: 'CBOE_BZX', label: 'Cboe BZX', tvPrefix: 'CBOE', timezone: 'America/New_York', usEquityCalendar: true, currency: 'USD' },
  SET: { code: 'SET', label: 'Stock Exchange of Thailand', tvPrefix: 'SET', timezone: 'Asia/Bangkok', usEquityCalendar: false, currency: 'THB' },
  CME: { code: 'CME', label: 'CME', tvPrefix: 'CME', timezone: 'America/Chicago', usEquityCalendar: false, currency: 'USD' },
  CME_MINI: { code: 'CME_MINI', label: 'CME (E-mini / Micro)', tvPrefix: 'CME_MINI', timezone: 'America/Chicago', usEquityCalendar: false, currency: 'USD' },
  CBOT: { code: 'CBOT', label: 'CBOT', tvPrefix: 'CBOT', timezone: 'America/Chicago', usEquityCalendar: false, currency: 'USD' },
  CBOT_MINI: { code: 'CBOT_MINI', label: 'CBOT (E-mini / Micro)', tvPrefix: 'CBOT_MINI', timezone: 'America/Chicago', usEquityCalendar: false, currency: 'USD' },
  COMEX: { code: 'COMEX', label: 'COMEX', tvPrefix: 'COMEX', timezone: 'America/New_York', usEquityCalendar: false, currency: 'USD' },
  NYMEX: { code: 'NYMEX', label: 'NYMEX', tvPrefix: 'NYMEX', timezone: 'America/New_York', usEquityCalendar: false, currency: 'USD' },
};

/** Yahoo Finance `exchange` codes → canonical. Unknown codes return null (never guessed). */
const YAHOO_CODES: Record<string, CanonicalExchange> = {
  NMS: 'NASDAQ', // Nasdaq Global Select
  NGM: 'NASDAQ', // Nasdaq Global Market
  NCM: 'NASDAQ', // Nasdaq Capital Market
  NAS: 'NASDAQ',
  NYQ: 'NYSE',
  NYS: 'NYSE',
  ASE: 'NYSE_AMERICAN',
  PCX: 'NYSE_ARCA',
  BTS: 'CBOE_BZX',
  SET: 'SET',
};

/** Tradier `exch` single-letter codes → canonical (Tradier "Exchange codes" reference). */
const TRADIER_CODES: Record<string, CanonicalExchange> = {
  Q: 'NASDAQ',
  N: 'NYSE',
  A: 'NYSE_AMERICAN',
  P: 'NYSE_ARCA',
  Z: 'CBOE_BZX',
};

export function exchangeFromYahoo(code: string | null | undefined): CanonicalExchange | null {
  if (!code) return null;
  return YAHOO_CODES[code.toUpperCase()] ?? null;
}

export function exchangeFromTradier(code: string | null | undefined): CanonicalExchange | null {
  if (!code) return null;
  return TRADIER_CODES[code.toUpperCase()] ?? null;
}

/** Accept an already-canonical code, a TradingView prefix, or a provider code. */
export function normalizeExchange(code: string | null | undefined): CanonicalExchange | null {
  if (!code) return null;
  const up = code.toUpperCase();
  if (up in EXCHANGES) return up as CanonicalExchange;
  return exchangeFromYahoo(up);
}

/**
 * Exchange-qualified TradingView symbol, or null when the venue is not
 * verified. Callers must not fall back to a bare ticker: TradingView would
 * pick whichever listing it ranks first, which may be a different company.
 */
export function tradingViewSymbol(symbol: string, exchange: CanonicalExchange | string | null | undefined): string | null {
  if (!symbol) return null;
  // Already qualified (futures continuous symbols are stored this way).
  if (symbol.includes(':')) return symbol;
  const ex = normalizeExchange(exchange ?? null);
  if (!ex) return null;
  const local = ex === 'SET' ? symbol.replace(/\.BK$/i, '') : symbol;
  return `${EXCHANGES[ex].tvPrefix}:${local.toUpperCase()}`;
}

export function tradingViewUrl(tvSymbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
}

export function exchangeLabel(exchange: CanonicalExchange | null | undefined): string {
  return exchange ? EXCHANGES[exchange].label : 'Exchange unverified';
}
