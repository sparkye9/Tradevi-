/**
 * Scheduled catalysts. FOMC dates are typed in from the Federal Reserve's
 * published calendar (source below) and need a yearly update; weekly data
 * releases come from the existing Forex Factory feed (this week only).
 * Events are shown as context — no event is assumed to cause a selloff.
 */
export const FOMC_SOURCE = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';

/** Decision day (second day) of each FOMC meeting, ET. Checked 2026-11-21 against the Fed's 2026 calendar and its 12 Nov 2026 revised 2027 schedule. */
export const FOMC_DECISION_DAYS: { date: string; note?: string }[] = [
  { date: '2026-01-28' },
  { date: '2026-03-18', note: 'with projections' },
  { date: '2026-04-29' },
  { date: '2026-06-17', note: 'with projections' },
  { date: '2026-07-29' },
  { date: '2026-09-16', note: 'with projections' },
  { date: '2026-10-28' },
  { date: '2026-12-09', note: 'with projections' },
  { date: '2027-01-27' },
  { date: '2027-03-17' },
  { date: '2027-04-28' },
  { date: '2027-06-09' },
  { date: '2027-07-28' },
  { date: '2027-09-15' },
  { date: '2027-10-27', note: 'strategy meeting — no policy decision' },
  { date: '2027-11-17' },
  { date: '2028-01-26' },
];

export interface Catalyst {
  date: string;
  /** ISO time when known. */
  at?: string;
  title: string;
  kind: 'FOMC' | 'Inflation' | 'Employment' | 'Growth' | 'Other';
  impact: 'High' | 'Medium' | 'Low' | 'Unknown';
  relevance: string;
  source: string;
}

const RELEVANCE: Record<Catalyst['kind'], string> = {
  FOMC: 'Rate decision and guidance can reprice yields, the dollar and equity volatility in minutes.',
  Inflation: 'A hot print can push yields up and pressure richly valued stocks; a soft one can do the reverse.',
  Employment: 'Payrolls move rate expectations; a sharp miss can raise growth fears.',
  Growth: 'Growth surprises shift earnings expectations and credit risk.',
  Other: 'Scheduled event with possible market impact.',
};

function kindOf(title: string): Catalyst['kind'] {
  const t = title.toLowerCase();
  if (/fomc|federal funds|fed chair|powell|rate decision/.test(t)) return 'FOMC';
  if (/cpi|pce|ppi|inflation/.test(t)) return 'Inflation';
  if (/payroll|employment|jobless|unemployment|jolts/.test(t)) return 'Employment';
  if (/gdp|retail sales|ism|pmi/.test(t)) return 'Growth';
  return 'Other';
}

export function fomcCatalysts(from: string, to: string): Catalyst[] {
  return FOMC_DECISION_DAYS.filter((d) => d.date >= from && d.date <= to).map((d) => ({
    date: d.date,
    title: `FOMC decision${d.note ? ` (${d.note})` : ''}`,
    kind: 'FOMC',
    impact: d.note?.startsWith('strategy') ? 'Medium' : 'High',
    relevance: RELEVANCE.FOMC,
    source: 'Federal Reserve calendar',
  }));
}

export function weeklyCatalysts(events: { title: string; country: string; impact: string; at: string }[]): Catalyst[] {
  return events
    .filter((e) => e.country === 'USD' && (e.impact === 'High' || e.impact === 'Medium'))
    .filter((e) => !/fomc|federal funds rate/i.test(e.title)) // FOMC comes from the Fed calendar
    .map((e) => {
      const kind = kindOf(e.title);
      return {
        date: e.at.slice(0, 10),
        at: e.at,
        title: e.title,
        kind,
        impact: e.impact as Catalyst['impact'],
        relevance: RELEVANCE[kind],
        source: 'Forex Factory (weekly export)',
      };
    });
}

/** High-impact events dated between today and an expiration. */
export function catalystsBefore(cats: Catalyst[], expiration: string, today: string): number {
  return cats.filter((c) => c.impact === 'High' && c.date >= today && c.date <= expiration).length;
}
