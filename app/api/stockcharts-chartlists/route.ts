import { NextResponse } from 'next/server';
import { authenticateStockCharts } from '@/lib/stockcharts-auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SCChartList {
  id: string;
  name: string;
  symbols: string[];
  url: string;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let cache: { lists: SCChartList[]; ts: number } | null = null;

// ─── Fetch ChartLists ─────────────────────────────────────────────────────────

async function fetchChartLists(sessionCookies: string): Promise<SCChartList[]> {
  // Fetch the member ChartLists page
  const resp = await fetch('https://stockcharts.com/h-sc/ui?s=SPY&p=D', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':     'text/html,application/xhtml+xml,*/*',
      'Cookie':     sessionCookies,
    },
    cache: 'no-store',
  });

  if (!resp.ok) return [];

  const html = await resp.text();
  return parseChartLists(html);
}

function parseChartLists(html: string): SCChartList[] {
  const lists: SCChartList[] = [];

  // StockCharts embeds ChartList data in <select> or <option> elements
  // Pattern: <option value="LISTID">List Name</option> inside a chartlist select
  const listBlockMatch = html.match(/chartlist[^>]*>([\s\S]*?)<\/select>/i);
  if (!listBlockMatch) {
    // Fallback: try to find any named list anchors
    const anchors = Array.from(html.matchAll(/<a[^>]+href="([^"]*chartlist[^"]*)"[^>]*>([^<]+)<\/a>/gi));
    for (const [, href, name] of anchors) {
      const idMatch = href.match(/chartlist[_/-]?(\d+)/i);
      if (idMatch) {
        lists.push({
          id:      idMatch[1],
          name:    name.trim(),
          symbols: [],
          url:     `https://stockcharts.com${href.startsWith('/') ? '' : '/'}${href}`,
        });
      }
    }
    return lists.slice(0, 20);
  }

  const options = Array.from(listBlockMatch[1].matchAll(/<option\s+value="(\d+)"[^>]*>([^<]+)<\/option>/gi));
  for (const [, id, name] of options) {
    lists.push({
      id,
      name:    name.trim(),
      symbols: [],
      url:     `https://stockcharts.com/h-sc/ui?s=SPY&listNum=${id}`,
    });
  }
  return lists.slice(0, 20);
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json({ lists: cache.lists, cached: true });
  }

  const session = await authenticateStockCharts();
  if (!session) {
    return NextResponse.json(
      { lists: [], error: 'StockCharts not authenticated. Check STOCKCHARTS_EMAIL and STOCKCHARTS_PASSWORD.' },
      { status: 401 },
    );
  }

  try {
    const lists = await fetchChartLists(session);
    cache = { lists, ts: Date.now() };
    return NextResponse.json({ lists, cached: false });
  } catch (err: any) {
    return NextResponse.json({ lists: [], error: err?.message }, { status: 503 });
  }
}
