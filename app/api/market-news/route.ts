import { NextResponse } from 'next/server';
import { fetchYahooNews } from '@/lib/yahooFinance';

type NewsSourceStatus = {
  name: string;
  status: 'ok' | 'unavailable' | 'api key required' | 'placeholder';
  count: number;
  error?: string;
};

type MarketArticle = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
};

type NewsPayload = {
  success: boolean;
  sources: NewsSourceStatus[];
  articles: MarketArticle[];
  fetchedAt: string;
  error?: string;
};

const NEWS_SOURCES = [
  // Primary — most reliable feeds first
  { name: 'MarketWatch', type: 'rss', url: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
  { name: 'Investing.com', type: 'rss', url: 'https://www.investing.com/rss/news.rss' },
  { name: 'Seeking Alpha', type: 'rss', url: 'https://seekingalpha.com/market_currents.xml' },
  { name: 'Reuters', type: 'rss', url: 'https://feeds.reuters.com/reuters/businessNews' },
  { name: 'CNBC', type: 'rss', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  // Yahoo Finance via direct API (may require crumb auth)
  { name: 'Yahoo Finance', type: 'yahoo', symbol: 'SPY' },
] as const;

function extractXmlText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
  return m?.[1]?.trim() ?? '';
}

function extractXmlAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i'));
  return m?.[1]?.trim() ?? '';
}

function parseRssItems(xmlText: string, sourceName: string): MarketArticle[] {
  const itemPattern = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  const matches = Array.from(xmlText.matchAll(itemPattern));

  return matches
    .map((match) => {
      const content = match[1];
      const title = extractXmlText(content, 'title');
      const link =
        extractXmlAttr(content, 'link', 'href') ||
        extractXmlText(content, 'link') ||
        extractXmlText(content, 'guid');
      const publishedAt =
        extractXmlText(content, 'pubDate') ||
        extractXmlText(content, 'published') ||
        extractXmlText(content, 'updated') ||
        new Date().toISOString();
      const summary =
        extractXmlText(content, 'description') ||
        extractXmlText(content, 'summary') ||
        '';

      return { title, source: sourceName, url: link, publishedAt, summary };
    })
    .filter((article) => article.title && article.url);
}

async function fetchRssFeed(url: string, sourceName: string): Promise<{ articles: MarketArticle[]; status: NewsSourceStatus }> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return {
        articles: [],
        status: { name: sourceName, status: 'unavailable', count: 0, error: `Feed request failed (${response.status})` },
      };
    }

    const text = await response.text();
    const articles = parseRssItems(text, sourceName).slice(0, 8);

    return {
      articles,
      status: { name: sourceName, status: 'ok', count: articles.length },
    };
  } catch (error: unknown) {
    return {
      articles: [],
      status: {
        name: sourceName,
        status: 'unavailable',
        count: 0,
        error: error instanceof Error ? error.message : 'Failed to fetch feed',
      },
    };
  }
}

async function fetchYahooNewsSource(): Promise<{ articles: MarketArticle[]; status: NewsSourceStatus }> {
  try {
    const items = await fetchYahooNews('SPY');
    const articles = items.map((item) => ({
      title: item.title,
      source: item.publisher || 'Yahoo Finance',
      url: item.link,
      publishedAt: item.publishedAt,
      summary: item.summary ?? '',
    })).slice(0, 6);

    return {
      articles,
      status: { name: 'Yahoo Finance', status: 'ok', count: articles.length },
    };
  } catch (error: unknown) {
    return {
      articles: [],
      status: {
        name: 'Yahoo Finance',
        status: 'unavailable',
        count: 0,
        error: error instanceof Error ? error.message : 'Failed to load Yahoo Finance news',
      },
    };
  }
}

export async function GET() {
  const fetchedAt = new Date().toISOString();
  const sourceStatuses: NewsSourceStatus[] = [];
  const articleMap = new Map<string, MarketArticle>();

  for (const source of NEWS_SOURCES) {
    if (source.type === 'yahoo') {
      const result = await fetchYahooNewsSource();
      sourceStatuses.push(result.status);
      result.articles.forEach((article) => {
        if (!articleMap.has(article.url)) {
          articleMap.set(article.url, article);
        }
      });
      continue;
    }

    if (source.type === 'rss' && source.url) {
      const result = await fetchRssFeed(source.url, source.name);
      sourceStatuses.push(result.status);
      result.articles.forEach((article) => {
        if (!articleMap.has(article.url)) {
          articleMap.set(article.url, article);
        }
      });
      continue;
    }
  }

  const articles = Array.from(articleMap.values())
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 20);

  return NextResponse.json({
    success: true,
    sources: sourceStatuses,
    articles,
    fetchedAt,
  } satisfies NewsPayload, {
    status: 200,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}
