/**
 * US cash + CME holiday calendar (observed dates).
 * CME equity-index futures typically still trade on most US bank holidays
 * (with early closes). They are fully closed on New Year's Day, Good Friday,
 * and Christmas. Do not treat this as a live exchange calendar feed.
 */

export type HolidayKind = "cme_closed" | "cash_closed";

export interface MarketHoliday {
  /** YYYY-MM-DD in America/New_York */
  date: string;
  name: string;
  kind: HolidayKind;
}

const NYD = "New Year's Day";
const MLK = "Martin Luther King Jr. Day";
const PRES = "Presidents' Day";
const GF = "Good Friday";
const MEM = "Memorial Day";
const JTE = "Juneteenth";
const IND = "Independence Day";
const LAB = "Labor Day";
const THX = "Thanksgiving";
const XMAS = "Christmas";

/** Observed NYSE/CME dates through 2028. */
const HOLIDAYS: MarketHoliday[] = [
  // 2025
  { date: "2025-01-01", name: NYD, kind: "cme_closed" },
  { date: "2025-01-20", name: MLK, kind: "cash_closed" },
  { date: "2025-02-17", name: PRES, kind: "cash_closed" },
  { date: "2025-04-18", name: GF, kind: "cme_closed" },
  { date: "2025-05-26", name: MEM, kind: "cash_closed" },
  { date: "2025-06-19", name: JTE, kind: "cash_closed" },
  { date: "2025-07-04", name: IND, kind: "cash_closed" },
  { date: "2025-09-01", name: LAB, kind: "cash_closed" },
  { date: "2025-11-27", name: THX, kind: "cash_closed" },
  { date: "2025-12-25", name: XMAS, kind: "cme_closed" },
  // 2026
  { date: "2026-01-01", name: NYD, kind: "cme_closed" },
  { date: "2026-01-19", name: MLK, kind: "cash_closed" },
  { date: "2026-02-16", name: PRES, kind: "cash_closed" },
  { date: "2026-04-03", name: GF, kind: "cme_closed" },
  { date: "2026-05-25", name: MEM, kind: "cash_closed" },
  { date: "2026-06-19", name: JTE, kind: "cash_closed" },
  { date: "2026-07-03", name: `${IND} (observed)`, kind: "cash_closed" },
  { date: "2026-09-07", name: LAB, kind: "cash_closed" },
  { date: "2026-11-26", name: THX, kind: "cash_closed" },
  { date: "2026-12-25", name: XMAS, kind: "cme_closed" },
  // 2027
  { date: "2027-01-01", name: NYD, kind: "cme_closed" },
  { date: "2027-01-18", name: MLK, kind: "cash_closed" },
  { date: "2027-02-15", name: PRES, kind: "cash_closed" },
  { date: "2027-03-26", name: GF, kind: "cme_closed" },
  { date: "2027-05-31", name: MEM, kind: "cash_closed" },
  { date: "2027-06-18", name: `${JTE} (observed)`, kind: "cash_closed" },
  { date: "2027-07-05", name: `${IND} (observed)`, kind: "cash_closed" },
  { date: "2027-09-06", name: LAB, kind: "cash_closed" },
  { date: "2027-11-25", name: THX, kind: "cash_closed" },
  { date: "2027-12-24", name: `${XMAS} (observed)`, kind: "cme_closed" },
  // 2028-01-01 falls on a Saturday. NYSE does NOT close the prior Friday for
  // New Year's Day (year-end accounting exception — markets were open on
  // Fri 2021-12-31 for the same reason), so 2027-12-31 is a normal session.
  // 2028
  { date: "2028-01-01", name: NYD, kind: "cme_closed" },
  { date: "2028-01-17", name: MLK, kind: "cash_closed" },
  { date: "2028-02-21", name: PRES, kind: "cash_closed" },
  { date: "2028-04-14", name: GF, kind: "cme_closed" },
  { date: "2028-05-29", name: MEM, kind: "cash_closed" },
  { date: "2028-06-19", name: JTE, kind: "cash_closed" },
  { date: "2028-07-04", name: IND, kind: "cash_closed" },
  { date: "2028-09-04", name: LAB, kind: "cash_closed" },
  { date: "2028-11-23", name: THX, kind: "cash_closed" },
  { date: "2028-12-25", name: XMAS, kind: "cme_closed" },
];

const BY_DATE = new Map(HOLIDAYS.map((h) => [h.date, h]));

/**
 * NYSE early-close days (cash closes 1:00 PM ET; CME equity index closes
 * 12:15 PM CT / 1:15 PM ET). Only dates published or following the fixed
 * rule (day after Thanksgiving; Dec 24 and Jul 3 on a weekday that is not
 * itself the observed holiday) are listed — confirm against the NYSE / CME
 * holiday calendars each year.
 */
const EARLY_CLOSES: { date: string; name: string }[] = [
  { date: "2025-07-03", name: "Independence Day eve" },
  { date: "2025-11-28", name: "Day after Thanksgiving" },
  { date: "2025-12-24", name: "Christmas Eve" },
  { date: "2026-11-27", name: "Day after Thanksgiving" },
  { date: "2026-12-24", name: "Christmas Eve" },
  { date: "2027-11-26", name: "Day after Thanksgiving" },
  { date: "2028-07-03", name: "Independence Day eve" },
  { date: "2028-11-24", name: "Day after Thanksgiving" },
];
const EARLY_BY_DATE = new Map(EARLY_CLOSES.map((h) => [h.date, h]));

/** Early-close day for the US cash session, or null. */
export function earlyCloseOn(ymd: string): { date: string; name: string } | null {
  return EARLY_BY_DATE.get(ymd) ?? null;
}

export function holidayOn(ymd: string): MarketHoliday | null {
  return BY_DATE.get(ymd) ?? null;
}

export function isCmeClosed(ymd: string): boolean {
  return holidayOn(ymd)?.kind === "cme_closed";
}

export function isUsCashHoliday(ymd: string): boolean {
  return BY_DATE.has(ymd);
}
