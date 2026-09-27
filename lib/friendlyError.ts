import { marketClock } from './powerHour';

/**
 * Turn raw data-feed errors ("Yahoo Finance 403 for NQ=F …") into something a
 * student can understand. The raw text is still worth keeping for whoever
 * runs the site, so callers can show it as a tooltip / details line.
 */
export function friendlyDataError(raw: string | null | undefined): string {
  const msg = (raw ?? '').toLowerCase();
  const clock = marketClock();
  const closedNote = clock.tradesOpen
    ? ''
    : ' Markets are closed right now, so some feeds go quiet — try again during market hours (weekdays 9:30 AM–4:00 PM ET).';

  if (/\b(401|403|429)\b|blocked|rate.?limit|too many requests|forbidden|unauthori[sz]ed|crumb/.test(msg)) {
    return `The free market-data feed is busy or refusing requests at the moment.${closedNote || ' Give it a minute and refresh.'}`;
  }
  if (msg.includes('market may be closed') || msg.includes('no valid candles') || msg.includes('no data')) {
    return clock.tradesOpen
      ? 'No fresh price data came back for this symbol. Refresh in a minute.'
      : 'Markets are closed, so there is no fresh price data yet. Check back during market hours (weekdays 9:30 AM–4:00 PM ET).';
  }
  if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('timeout') || msg.includes('timed out')) {
    return `Couldn't reach the market-data feed.${closedNote || ' Check your connection and refresh.'}`;
  }
  if (msg.includes('not configured') || msg.includes('api key') || msg.includes('token')) {
    return 'This data source is not switched on for this site yet.';
  }
  return `Market data isn't available right now.${closedNote || ' Refresh in a minute.'}`;
}
