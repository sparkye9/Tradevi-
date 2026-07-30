// lib/macroInstruments.ts — quotes for instruments the Finviz screener/futures
// page doesn't cover: VIX (an index, not a stock or future) and crypto
// (Bitcoin, Ethereum). Reuses the existing Yahoo v8 chart fallback already in
// the codebase (lib/yahoo-fallback.ts) rather than adding a new provider.
import { fetchYahooCandles } from './yahooChart';
import type { FinvizFuture } from './finviz';

const MACRO_SYMBOLS: Record<string, { yahoo: string; name: string }> = {
  VIX: { yahoo: '^VIX', name: 'CBOE Volatility Index' },
  BTC: { yahoo: 'BTC-USD', name: 'Bitcoin' },
  ETH: { yahoo: 'ETH-USD', name: 'Ethereum' },
};

async function fetchOne(symbol: string): Promise<FinvizFuture> {
  const now = new Date().toISOString();
  const meta = MACRO_SYMBOLS[symbol];
  try {
    const { candles } = await fetchYahooCandles(meta.yahoo, '5d', '1d');
    if (candles.length < 2) throw new Error('not enough candles');
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const changePercent = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;
    return {
      symbol,
      name: meta.name,
      price: last.close,
      changePercent,
      direction: changePercent === null ? null : changePercent > 0.05 ? 'up' : changePercent < -0.05 ? 'down' : 'flat',
      lastUpdated: now,
    };
  } catch {
    return { symbol, name: meta.name, price: null, changePercent: null, direction: null, lastUpdated: now };
  }
}

/** VIX + Bitcoin + Ethereum — instruments STEP 1 requires that aren't stocks/futures. */
export async function fetchMacroInstruments(): Promise<FinvizFuture[]> {
  return Promise.all(Object.keys(MACRO_SYMBOLS).map(fetchOne));
}
