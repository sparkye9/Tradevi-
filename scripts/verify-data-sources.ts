/**
 * Check every instrument against both free feeds and print what came back.
 * Run this from a machine or environment with outbound network access:
 *
 *   npx tsx scripts/verify-data-sources.ts
 *
 * Use it to confirm the Stooq symbols in lib/marketUniverse.ts. Any row that
 * prints "FAIL" for Stooq needs its symbol corrected there or set to null, so
 * the fallback does not waste a request on a symbol that does not exist.
 */
import { MARKET_UNIVERSE } from '../lib/marketUniverse';
import { fetchYahooCandles } from '../lib/yahooChart';
import { fetchStooqDaily } from '../lib/stooq';

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

(async () => {
  console.log(pad('symbol', 8) + pad('yahoo', 34) + 'stooq');
  console.log('-'.repeat(90));
  for (const u of MARKET_UNIVERSE) {
    let yahoo: string;
    try {
      const { candles } = await fetchYahooCandles(u.yahoo, '2y', '1d');
      const last = candles[candles.length - 1];
      yahoo = `OK ${candles.length} bars, last ${last.close.toFixed(2)}`;
    } catch (e) {
      yahoo = `FAIL ${(e instanceof Error ? e.message : String(e)).slice(0, 24)}`;
    }

    let stooq: string;
    if (!u.stooq) {
      stooq = 'not configured';
    } else {
      try {
        const { candles } = await fetchStooqDaily(u.stooq);
        const last = candles[candles.length - 1];
        const date = new Date(last.time * 1000).toISOString().slice(0, 10);
        stooq = `OK ${u.stooq} ${candles.length} bars, last ${last.close.toFixed(2)} on ${date}`;
      } catch (e) {
        stooq = `FAIL ${u.stooq} ${(e instanceof Error ? e.message : String(e)).slice(0, 40)}`;
      }
    }
    console.log(pad(u.symbol, 8) + pad(yahoo, 34) + stooq);
  }
  console.log(
    '\nIf Yahoo and Stooq disagree on the last close by more than a tick or two, they are tracking\n' +
      'different contracts (Stooq continuous series can roll on a different day). Prefer Yahoo as\n' +
      'primary and treat Stooq as the keep-the-page-alive fallback.',
  );
})();
