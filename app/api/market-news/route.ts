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
  { name: 'Yahoo Finance', type: 'yahoo', symbol: 'SPY' },
  { name: 'Reuters', type: 'rss', url: 'https://feeds.reuters.com/reuters/businessNews' },
  { name: 'CNBC', type: 'rss', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { name: 'MarketWatch', type: 'rss', url: 'https://www.marketwatch.com/rss/topstories' },
  { name: 'Barchart', type: 'placeholder' },
  { name: 'X', type: 'placeholder' },
] as const;

function parseRssItems(xmlText: string, sourceName: string): MarketArticle[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const items = Array.from(doc.querySelectorAll('item, entry'));

  return items
    .map((item) => {
      const title = item.querySelector('title')?.textContent?.trim() ?? '';
      let link = item.querySelector('link')?.getAttribute('href')?.trim() ?? item.querySelector('link')?.textContent?.trim() ?? '';
      if (!link && item.querySelector('guid')) {
        link = item.querySelector('guid')?.textContent?.trim() ?? '';
      }
      const publishedAt = item.querySelector('pubDate')?.textContent?.trim()
        || item.querySelector('published')?.textContent?.trim()
        || item.querySelector('updated')?.textContent?.trim()
        || new Date().toISOString();
      const summary = item.querySelector('description')?.textContent?.trim()
        || item.querySelector('summary')?.textContent?.trim()
        || '';

      return {
        title,
        source: sourceName,
        url: link,
        publishedAt,
        summary,
      };
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
    const articles = parseRssItems(text, sourceName).slice(0, 6);

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
    if (source.type === 'placeholder') {
      sourceStatuses.push({ name: source.name, status: 'placeholder', count: 0 });
      continue;
    }

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
    .slice(0, 12);

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
