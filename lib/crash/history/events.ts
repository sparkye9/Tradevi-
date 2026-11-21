/**
 * Research windows and decline detection for the Historical Crash Simulator.
 *
 * Research windows are periods worth studying, not pre-labelled successful
 * signals: the simulator scores them with exactly the same engine as any
 * other date. Each milestone carries the date it became public, so a replay
 * shows only milestones on or before the replay date. Milestones whose
 * meaning is known only afterwards (a "market bottom") are marked
 * `hindsight` and stay hidden until the user reveals the outcome.
 *
 * Major declines are detected mechanically from closing prices with a
 * configurable definition; nothing about them is typed in by hand.
 */
import type { Bar } from '../series';

export interface Milestone {
  date: string;
  text: string;
  /** Only identifiable after the fact (e.g. "the low"). Hidden in No Hindsight Mode. */
  hindsight?: boolean;
}

export interface ResearchWindow {
  id: string;
  label: string;
  /** Default replay start (the date the user is placed on). */
  start: string;
  end: string;
  focus: string[];
  /** Underlyings suggested for this window. */
  symbols: string[];
  milestones: Milestone[];
}

export const RESEARCH_WINDOWS: ResearchWindow[] = [
  {
    id: 'gfc',
    label: '2007–2009 Financial Crisis',
    start: '2007-01-03',
    end: '2009-06-30',
    focus: ['Financial-sector weakness', 'Mortgage and credit stress', 'Credit spreads', 'Breadth', 'Volatility repricing'],
    symbols: ['SPY', 'QQQ', 'IWM', 'XLF', 'KRE'],
    milestones: [
      { date: '2007-02-27', text: 'Global equity sell-off; subprime lender stress in the news' },
      { date: '2007-06-20', text: 'Two Bear Stearns mortgage hedge funds reported near collapse' },
      { date: '2007-08-09', text: 'BNP Paribas freezes three funds exposed to US subprime' },
      { date: '2008-03-16', text: 'JPMorgan agrees to buy Bear Stearns with Fed support' },
      { date: '2008-09-07', text: 'Fannie Mae and Freddie Mac placed into conservatorship' },
      { date: '2008-09-15', text: 'Lehman Brothers files for bankruptcy' },
      { date: '2008-09-29', text: 'House rejects the first TARP bill' },
      { date: '2009-03-09', text: 'S&P 500 closes at its cycle low', hindsight: true },
    ],
  },
  {
    id: 'y2011',
    label: '2011 Sell-off',
    start: '2011-04-01',
    end: '2011-12-30',
    focus: ['European sovereign debt', 'US downgrade', 'Volatility expansion'],
    symbols: ['SPY', 'QQQ', 'IWM', 'XLF'],
    milestones: [
      { date: '2011-08-05', text: 'S&P downgrades the US credit rating (after the close)' },
      { date: '2011-08-08', text: 'First session after the downgrade' },
      { date: '2011-10-03', text: 'S&P 500 closes at the low of the sell-off', hindsight: true },
    ],
  },
  {
    id: 'y2015',
    label: '2015–2016 Volatility',
    start: '2015-05-01',
    end: '2016-03-31',
    focus: ['China', 'Oil weakness', 'High-yield credit stress'],
    symbols: ['SPY', 'QQQ', 'IWM'],
    milestones: [
      { date: '2015-08-11', text: 'China devalues the yuan' },
      { date: '2015-08-24', text: 'Disorderly open; many ETFs halted' },
      { date: '2016-02-11', text: 'S&P 500 closes at the low of the period', hindsight: true },
    ],
  },
  {
    id: 'y2018',
    label: '2018 Corrections',
    start: '2017-11-01',
    end: '2019-01-31',
    focus: ['Short-volatility unwind', 'Fed tightening', 'Q4 sell-off'],
    symbols: ['SPY', 'QQQ', 'IWM'],
    milestones: [
      { date: '2018-02-05', text: 'VIX doubles in a day; short-volatility products collapse' },
      { date: '2018-12-24', text: 'S&P 500 closes at the low of the Q4 sell-off', hindsight: true },
    ],
  },
  {
    id: 'covid',
    label: '2020 COVID Crash',
    start: '2019-11-01',
    end: '2020-06-30',
    focus: ['Complacency', 'Volatility repricing', 'Speed of the decline'],
    symbols: ['SPY', 'QQQ', 'IWM', 'DIA'],
    milestones: [
      { date: '2020-01-21', text: 'First US COVID-19 case reported' },
      { date: '2020-02-19', text: 'S&P 500 record close' },
      { date: '2020-02-24', text: 'Outbreak in Italy; global sell-off' },
      { date: '2020-03-16', text: 'VIX closes at a record 82.69' },
      { date: '2020-03-23', text: 'Fed announces open-ended asset purchases; S&P 500 low', hindsight: true },
    ],
  },
  {
    id: 'y2022',
    label: '2022 Bear Market',
    start: '2021-10-01',
    end: '2022-12-30',
    focus: ['Inflation', 'Fed tightening', 'Technology weakness', 'Failed rallies'],
    symbols: ['SPY', 'QQQ', 'IWM'],
    milestones: [
      { date: '2021-11-30', text: 'Powell retires "transitory" for inflation' },
      { date: '2022-03-16', text: 'First Fed rate hike of the cycle' },
      { date: '2022-06-15', text: 'Fed hikes 75 basis points' },
      { date: '2022-10-12', text: 'S&P 500 closes at the low of the bear market', hindsight: true },
    ],
  },
];

export const BIG_SHORT_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'XLF', 'KRE'];

export interface DeclineDefinition {
  /** Decline from the rolling high that counts as major, decimal (0.10 or 0.20). */
  threshold: number;
  /** Sessions in the rolling high (252 ≈ 52 weeks). */
  highWindow: number;
}

export const DEFAULT_DECLINE: DeclineDefinition = { threshold: 0.1, highWindow: 252 };

export interface DeclineEvent {
  /** Rolling-high date the decline is measured from. */
  peakDate: string;
  peak: number;
  /** First close at or beyond the threshold: the date the decline became "major". */
  crossDate: string;
  troughDate: string;
  trough: number;
  maxDrawdown: number;
  /** First new rolling high after the trough, or null if not yet recovered. */
  endDate: string | null;
}

/**
 * Non-overlapping major declines. An event starts on the first close at least
 * `threshold` below the rolling high and lasts until the close makes a new
 * rolling high; a new event cannot start inside an old one, so one bear
 * market never counts as several hits.
 */
export function detectDeclines(bars: readonly Bar[], def: DeclineDefinition = DEFAULT_DECLINE): DeclineEvent[] {
  const out: DeclineEvent[] = [];
  let cur: DeclineEvent | null = null;
  for (let i = 0; i < bars.length; i++) {
    const lo = Math.max(0, i - def.highWindow + 1);
    let hi = lo;
    for (let j = lo + 1; j <= i; j++) if (bars[j].close >= bars[hi].close) hi = j;
    const close = bars[i].close;
    if (cur) {
      if (close < cur.trough) {
        cur.trough = close;
        cur.troughDate = bars[i].date;
        cur.maxDrawdown = 1 - close / cur.peak;
      }
      if (hi === i && i > 0) {
        cur.endDate = bars[i].date;
        out.push(cur);
        cur = null;
      }
      continue;
    }
    const dd = 1 - close / bars[hi].close;
    if (dd >= def.threshold) {
      cur = { peakDate: bars[hi].date, peak: bars[hi].close, crossDate: bars[i].date, troughDate: bars[i].date, trough: close, maxDrawdown: dd, endDate: null };
    }
  }
  if (cur) out.push(cur);
  return out;
}
