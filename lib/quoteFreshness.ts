/**
 * Quote instrument registry + freshness classification.
 *
 * Futures, cash indexes, spot FX, spot crypto and CFDs are different
 * instruments with different prices. ES (future) ≠ SPX (cash index);
 * NAS100 / US30 are broker CFDs whose price is set by each broker and has no
 * free public feed. Each row says exactly what it is and where it came from,
 * and a row with no feed says so instead of borrowing another instrument's
 * price.
 */
import { marketClock } from './powerHour';

export type QuoteClass = 'future' | 'cash_index' | 'spot_fx' | 'spot_crypto' | 'spot_metal' | 'cfd' | 'yield';

export const QUOTE_CLASS_LABEL: Record<QuoteClass, string> = {
  future: 'Futures (front month)',
  cash_index: 'Cash index',
  spot_fx: 'Spot FX',
  spot_crypto: 'Spot crypto',
  spot_metal: 'Spot metal',
  cfd: 'CFD (broker-specific)',
  yield: 'Treasury yield',
};

export interface QuoteInstrument {
  symbol: string;
  name: string;
  cls: QuoteClass;
  /** Yahoo symbol, or null when there is no free feed for this instrument. */
  yahoo: string | null;
  /** Shown when yahoo is null, or to warn about substitution. */
  note?: string;
  /** Market hours that decide "closed" vs "stale". */
  hours: 'globex' | 'cash' | '24x7' | 'fx';
}

export const QUOTE_INSTRUMENTS: QuoteInstrument[] = [
  { symbol: 'ES', name: 'E-mini S&P 500', cls: 'future', yahoo: 'ES=F', hours: 'globex', note: 'MES uses the same price.' },
  { symbol: 'NQ', name: 'E-mini Nasdaq-100', cls: 'future', yahoo: 'NQ=F', hours: 'globex', note: 'MNQ uses the same price.' },
  { symbol: 'YM', name: 'E-mini Dow', cls: 'future', yahoo: 'YM=F', hours: 'globex', note: 'MYM uses the same price.' },
  { symbol: 'RTY', name: 'E-mini Russell 2000', cls: 'future', yahoo: 'RTY=F', hours: 'globex', note: 'M2K uses the same price.' },
  { symbol: 'GC', name: 'Gold futures', cls: 'future', yahoo: 'GC=F', hours: 'globex', note: 'MGC uses the same price. Not spot gold.' },
  { symbol: 'SI', name: 'Silver futures', cls: 'future', yahoo: 'SI=F', hours: 'globex' },
  { symbol: 'CL', name: 'WTI crude futures', cls: 'future', yahoo: 'CL=F', hours: 'globex' },
  { symbol: 'DXY', name: 'US Dollar Index futures', cls: 'future', yahoo: 'DX=F', hours: 'globex' },
  { symbol: 'VIX', name: 'Cboe Volatility Index', cls: 'cash_index', yahoo: '^VIX', hours: 'cash', note: 'Cash index, not VX futures.' },
  { symbol: 'TNX', name: '10-Year yield ×10', cls: 'yield', yahoo: '^TNX', hours: 'cash' },
  { symbol: 'NDX', name: 'Nasdaq-100 cash index', cls: 'cash_index', yahoo: '^NDX', hours: 'cash', note: 'Reference for NAS100 CFDs — not the CFD price.' },
  { symbol: 'DJI', name: 'Dow Jones cash index', cls: 'cash_index', yahoo: '^DJI', hours: 'cash', note: 'Reference for US30 CFDs — not the CFD price.' },
  { symbol: 'BTC', name: 'Bitcoin / USD', cls: 'spot_crypto', yahoo: 'BTC-USD', hours: '24x7', note: 'Spot composite, not CME BTC futures.' },
  { symbol: 'EURUSD', name: 'Euro / US Dollar', cls: 'spot_fx', yahoo: 'EURUSD=X', hours: 'fx', note: 'Spot FX, not 6E futures.' },
  { symbol: 'USDJPY', name: 'US Dollar / Yen', cls: 'spot_fx', yahoo: 'JPY=X', hours: 'fx' },
  { symbol: 'XAUUSD', name: 'Spot gold', cls: 'spot_metal', yahoo: null, hours: 'fx', note: 'No free spot-gold feed is configured. GC futures trade at a premium (basis) to spot, so they are not shown as XAUUSD.' },
  { symbol: 'NAS100', name: 'Nasdaq-100 CFD', cls: 'cfd', yahoo: null, hours: 'globex', note: 'CFD prices are set by each broker. Use your broker’s feed. NDX (cash) and NQ (futures) are listed separately.' },
  { symbol: 'US30', name: 'Dow 30 CFD', cls: 'cfd', yahoo: null, hours: 'globex', note: 'CFD prices are set by each broker. Use your broker’s feed. DJI (cash) and YM (futures) are listed separately.' },
];

export type FreshnessState = 'live' | 'delayed' | 'stale' | 'closed' | 'unavailable';

export interface Freshness {
  state: FreshnessState;
  ageMinutes: number | null;
  detail: string;
}

/** Max quote age while the market is open before the row is flagged stale. */
export const STALE_AFTER_MINUTES = 30;

function etParts(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { weekday: p.weekday as string, mins: Number(p.hour) * 60 + Number(p.minute) };
}

/** Is the instrument's market open right now (by schedule, not by feed)? */
export function marketOpenFor(hours: QuoteInstrument['hours'], now: Date): boolean {
  if (hours === '24x7') return true;
  const clock = marketClock(now);
  if (hours === 'globex') return clock.tradesOpen;
  if (hours === 'cash') return clock.cashOpen;
  // Spot FX: Sunday ~5 PM ET to Friday ~5 PM ET.
  const { weekday, mins } = etParts(now);
  if (weekday === 'Sat') return false;
  if (weekday === 'Sun') return mins >= 17 * 60;
  if (weekday === 'Fri') return mins < 17 * 60;
  return true;
}

/**
 * Classify a quote. A quote is:
 *  - unavailable: no price or no timestamp
 *  - closed:      market is shut by schedule (age is expected)
 *  - stale:       market open but last trade older than STALE_AFTER_MINUTES
 *  - delayed:     provider says the feed is delayed (or we know it is)
 *  - live:        provider says real-time and the quote is fresh
 */
export function classifyQuote(opts: {
  price: number | null;
  quoteTimeSec: number | null;
  now: Date;
  hours: QuoteInstrument['hours'];
  /** Provider-stated delay in minutes; null when unknown (treated as delayed). */
  delayMinutes: number | null;
}): Freshness {
  const { price, quoteTimeSec, now, hours, delayMinutes } = opts;
  if (price == null || !Number.isFinite(price) || quoteTimeSec == null) {
    return { state: 'unavailable', ageMinutes: null, detail: 'No quote returned.' };
  }
  const age = Math.max(0, Math.round((now.getTime() - quoteTimeSec * 1000) / 60_000));
  if (!marketOpenFor(hours, now)) return { state: 'closed', ageMinutes: age, detail: `Market closed — last trade ${age} min ago.` };
  if (age > STALE_AFTER_MINUTES) return { state: 'stale', ageMinutes: age, detail: `STALE — market open but last quote is ${age} min old.` };
  if (delayMinutes == null || delayMinutes > 0) {
    return { state: 'delayed', ageMinutes: age, detail: delayMinutes ? `Delayed ~${delayMinutes} min by provider.` : 'Delayed feed (provider delay not stated).' };
  }
  return { state: 'live', ageMinutes: age, detail: 'Provider reports real-time.' };
}

/** True when a price is safe to feed into a trading calculation. */
export function usableForCalculation(f: Freshness): boolean {
  return f.state === 'live' || f.state === 'delayed';
}
