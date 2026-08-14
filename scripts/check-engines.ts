/**
 * Focused checks for the Globex clock, holiday calendar, and stocks quality engine.
 * Run: npx tsx scripts/check-engines.ts
 */
import { holidayOn, isCmeClosed, isUsCashHoliday } from '../lib/marketHolidays';
import { marketClock } from '../lib/powerHour';
import { stockQuality, smaTrendAligned, intradayTape } from '../lib/stockQuality';
import type { FinvizQuote } from '../lib/finviz';

let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`ok  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

function quote(partial: Partial<FinvizQuote>): FinvizQuote {
  return {
    symbol: 'TEST',
    rvol: null,
    unusualVolume: false,
    newHighDay: false,
    changePercent: null,
    gap: null,
    sma20rel: null,
    sma50rel: null,
    sma200rel: null,
    avgVolume: null,
    float: null,
    sector: null,
    industry: null,
    groupStrength: null,
    price: 10,
    lastUpdated: '',
    ...partial,
  };
}

// Holidays
check('Christmas 2025 is CME closed', isCmeClosed('2025-12-25'));
check('Good Friday 2025 is CME closed', isCmeClosed('2025-04-18'));
check('NYD 2025 is CME closed', isCmeClosed('2025-01-01'));
check('MLK 2025 is cash holiday not CME close', isUsCashHoliday('2025-01-20') && !isCmeClosed('2025-01-20'));
check('random Tuesday is not a holiday', holidayOn('2025-01-14') === null);
check('2028 NYD observed Friday 2027-12-31', isCmeClosed('2027-12-31'));

// Clock windows (ISO instants chosen so ET is unambiguous)
const xmas = marketClock(new Date('2025-12-25T20:00:00.000Z')); // Thu 15:00 EST
check('Christmas afternoon is Holiday / closed', xmas.session === 'Holiday' && xmas.tradesOpen === false && xmas.powerHour === false);

const gf = marketClock(new Date('2025-04-18T19:00:00.000Z')); // Fri 15:00 EDT
check('Good Friday afternoon is Holiday / closed', gf.session === 'Holiday' && gf.tradesOpen === false);

const mlk = marketClock(new Date('2025-01-20T20:00:00.000Z')); // Mon 15:00 EST (would be Power Hour)
check('MLK Globex stays open', mlk.tradesOpen === true);
check('MLK Power Hour is off', mlk.powerHour === false);
check('MLK cash is closed', mlk.cashOpen === false && mlk.holidayName === "Martin Luther King Jr. Day");

const power = marketClock(new Date('2025-01-14T20:30:00.000Z')); // Tue 15:30 EST
check('regular Tuesday 3:30 PM is Power Hour', power.powerHour === true && power.tradesOpen === true && power.cashOpen === true);

const cashOpen = marketClock(new Date('2025-01-14T15:00:00.000Z')); // Tue 10:00 EST
check('regular Tuesday 10:00 AM cash is open', cashOpen.cashOpen === true && cashOpen.tradesOpen === true && cashOpen.powerHour === false);

const sat = marketClock(new Date('2025-01-18T20:00:00.000Z'));
check('Saturday is Weekend', sat.session === 'Weekend' && sat.tradesOpen === false);

const halt = marketClock(new Date('2025-01-14T22:30:00.000Z')); // Tue 17:30 EST
check('Tue 5:30 PM is daily halt', halt.session === 'Maintenance' && halt.tradesOpen === false);

const sundayClosed = marketClock(new Date('2025-01-19T20:00:00.000Z')); // Sun 15:00 EST
check('Sunday 3 PM is still closed', sundayClosed.session === 'Weekend' && sundayClosed.tradesOpen === false);

const sundayOpen = marketClock(new Date('2025-01-19T23:30:00.000Z')); // Sun 18:30 EST
check('Sunday 6:30 PM Asia is open', sundayOpen.tradesOpen === true && sundayOpen.venues.includes('Asia'));

// Stocks quality
const look = stockQuality(
  quote({
    rvol: 3.2,
    sma50rel: 'above',
    sma200rel: 'above',
    changePercent: 1.4,
    unusualVolume: true,
  }),
  1.5,
);
check('volume + SMA up + green is LOOK long', look.label === 'LOOK' && look.side === 'long');
check('LOOK long is SMA-aligned for swing', smaTrendAligned(quote({ sma50rel: 'above', sma200rel: 'above' })));
check('LOOK with RVOL 3 is intraday tape', intradayTape(quote({ rvol: 3.2 }), 1.5));

const noTrade = stockQuality(
  quote({
    rvol: 0.8,
    sma50rel: 'above',
    sma200rel: 'below',
    changePercent: 0.1,
  }),
  1.5,
);
check('weak RVOL + mixed SMA is NO TRADE', noTrade.label === 'NO_TRADE' && noTrade.side === 'none');

const mixed = stockQuality(
  quote({
    rvol: 2.0,
    sma50rel: 'above',
    sma200rel: 'below',
    changePercent: 0.2,
  }),
  1.5,
);
check('volume without a side is NO TRADE', mixed.label === 'NO_TRADE');

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall engine checks passed');
