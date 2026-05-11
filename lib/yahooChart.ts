/**
 * Direct Yahoo Finance v8 chart API — no API key required.
 * Used as a fallback when Finnhub is unavailable or not configured.
 * Data is ~15-20 minutes delayed for US markets.
 */

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const YF_INTERVAL_MAP: Record<string, string> = {
  '1m': '1m', '2m': '2m', '5m': '5m', '15m': '15m', '30m': '30m',
  '60m': '60m', '1h': '60m', '1d': '1d', '5d': '5d', '1wk': '1wk', '1mo': '1mo',
};

const PERIOD_TO_DAYS: Record<string, number> = {
  '1d': 1, '5d': 5, '1mo': 30, '3mo': 90,
  '6mo': 180, '1y': 365, '2y': 730, '5y': 1825,
};

export interface YFCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchYahooCandles(
  symbol: string,
  period = '3mo',
  interval = '1d',
): Promise<{ candles: YFCandle[]; dataSource: 'yahoo_delayed' }> {
  const yfInterval = YF_INTERVAL_MAP[interval] ?? '1d';
  const days = PERIOD_TO_DAYS[period] ?? 90;
  const now  = Math.floor(Date.now() / 1000);
  const from = now - days * 86400;

  const url = `${YF_BASE}/${encodeURIComponent(symbol)}?period1=${from}&period2=${now}&interval=${yfInterval}&includePrePost=false`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TradingApp/1.0)',
      'Accept': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance ${res.status} for ${symbol} — market may be closed or symbol invalid`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    const errMsg = json?.chart?.error?.description ?? 'No data returned';
    throw new Error(`Yahoo Finance: ${errMsg}`);
  }

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens:   (number | null)[] = quote.open   ?? [];
  const highs:   (number | null)[] = quote.high   ?? [];
  const lows:    (number | null)[] = quote.low    ?? [];
  const closes:  (number | null)[] = quote.close  ?? [];
  const volumes: (number | null)[] = quote.volume ?? [];

  const candles: YFCandle[] = timestamps
    .map((ts, i) => ({
      time:   ts,
      open:   opens[i]   ?? 0,
      high:   highs[i]   ?? 0,
      low:    lows[i]    ?? 0,
      close:  closes[i]  ?? 0,
      volume: volumes[i] ?? 0,
    }))
    .filter(c => c.open > 0 && c.close > 0);

  if (candles.length === 0) {
    throw new Error(`No valid candles for ${symbol} — market may be closed`);
  }

  return { candles, dataSource: 'yahoo_delayed' };
}
