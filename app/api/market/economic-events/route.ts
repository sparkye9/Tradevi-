import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export interface EconEvent {
  time: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  name: string;
  actual?: string;
  forecast?: string;
  prior?: string;
}

function extractText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').trim();
}

function parseImpact(cells: string[]): 'HIGH' | 'MEDIUM' | 'LOW' {
  const combined = cells.join(' ').toLowerCase();
  if (combined.includes('high') || combined.includes('bull3') || combined.includes('impact3')) return 'HIGH';
  if (combined.includes('medium') || combined.includes('bull2') || combined.includes('impact2')) return 'MEDIUM';
  return 'LOW';
}

function parseCalendarHtml(html: string): EconEvent[] {
  const events: EconEvent[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    if (!rowHtml.includes('<td')) continue;

    const cells: string[] = [];
    const rawCells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      rawCells.push(tdMatch[1]);
      cells.push(extractText(tdMatch[1]));
    }
    if (cells.length < 3) continue;

    // Find event name: longest non-numeric, non-time, non-empty cell
    const name = cells
      .filter((c) => c.length > 5 && !/^\d+[:.%]/.test(c) && !/^[-–—]+$/.test(c))
      .sort((a, b) => b.length - a.length)[0] ?? '';
    if (!name) continue;

    const timeCell = cells.find((c) => /\d{1,2}:\d{2}/.test(c)) ?? '';
    const impact = parseImpact(rawCells);

    events.push({
      time: timeCell ? `${timeCell} ET` : '--',
      impact,
      name,
      actual: cells[cells.length - 3] || undefined,
      forecast: cells[cells.length - 2] || undefined,
      prior: cells[cells.length - 1] || undefined,
    });
  }

  return events;
}

let sessionCookieCache: { cookie: string; ts: number } | null = null;
const SESSION_TTL = 8 * 60 * 60 * 1000;

async function getSessionCookie(): Promise<string | null> {
  if (sessionCookieCache && Date.now() - sessionCookieCache.ts < SESSION_TTL) {
    return sessionCookieCache.cookie;
  }
  const override = process.env.FINVIZ_SESSION_COOKIE;
  if (override) {
    sessionCookieCache = { cookie: override, ts: Date.now() };
    return override;
  }
  const email = process.env.FINVIZ_EMAIL;
  const password = process.env.FINVIZ_PASSWORD;
  if (!email || !password) return null;
  try {
    const resp = await fetch('https://finviz.com/login_submit.ashx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; Tradevi/3.0)',
        Referer: 'https://finviz.com/login.ashx',
      },
      body: new URLSearchParams({ email, password, remember: 'on' }).toString(),
      redirect: 'manual',
    });
    const raw = resp.headers.get('set-cookie') ?? '';
    const match = raw.match(/_finviz_toekn=([^;]+)/);
    if (!match) return null;
    sessionCookieCache = { cookie: match[1], ts: Date.now() };
    return match[1];
  } catch {
    return null;
  }
}

let dataCache: { data: EconEvent[]; ts: number } | null = null;
const DATA_TTL = 5 * 60 * 1000;

export async function GET() {
  const now = new Date().toISOString();

  if (dataCache && Date.now() - dataCache.ts < DATA_TTL) {
    return NextResponse.json({ events: dataCache.data, lastUpdated: now, source: 'Finviz Elite' });
  }

  const cookie = await getSessionCookie();
  if (!cookie) {
    return NextResponse.json({
      events: [],
      lastUpdated: now,
      source: 'Finviz Elite',
      error: 'Set FINVIZ_EMAIL and FINVIZ_PASSWORD in .env.local',
    });
  }

  const cookieStr = cookie.includes('=') ? cookie : `_finviz_t=${cookie}; _finviz_toekn=${cookie}`;

  try {
    const resp = await fetch('https://elite.finviz.com/calendar.ashx', {
      headers: {
        Cookie: cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://elite.finviz.com/',
      },
      cache: 'no-store',
    });

    if (!resp.ok) {
      return NextResponse.json({
        events: [],
        lastUpdated: now,
        source: 'Finviz Elite',
        error: `HTTP ${resp.status} — session may be expired`,
      });
    }

    const html = await resp.text();
    const events = parseCalendarHtml(html).slice(0, 8);
    dataCache = { data: events, ts: Date.now() };
    return NextResponse.json({ events, lastUpdated: now, source: 'Finviz Elite' });
  } catch (err) {
    return NextResponse.json({
      events: [],
      lastUpdated: now,
      source: 'Finviz Elite',
      error: String(err),
    });
  }
}
