import { NextResponse } from 'next/server';
import { yfFetch } from '@/lib/yahoo-finance';

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

interface TickerData {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  isYield: boolean; // 10-yr shown as %, not $
}

const WATCH = [
  { symbol: 'YM=F',  label: 'DOW FUT',  isYield: false },
  { symbol: 'ES=F',  label: 'S&P FUT',  isYield: false },
  { symbol: 'NQ=F',  label: 'NAS FUT',  isYield: false },
  { symbol: 'CL=F',  label: 'OIL',      isYield: false },
  { symbol: 'GC=F',  label: 'GOLD',     isYield: false },
  { symbol: '^TNX',  label: 'US 10-YR', isYield: true  },
  { symbol: '^VIX',  label: 'VIX',      isYield: false },
];

async function fetchTicker(symbol: string, label: string, isYield: boolean): Promise<TickerData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`;
  const res  = await yfFetch(url);
  if (!res.ok) throw new Error(`Yahoo ${res.status} for ${symbol}`);

  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error(`Yahoo returned HTML for ${symbol}`);

  const json   = JSON.parse(text);
  const meta   = json?.chart?.result?.[0]?.meta ?? {};

  const price  = round2(meta.regularMarketPrice ?? 0);
  const prev   = round2(meta.chartPreviousClose ?? meta.previousClose ?? price);
  const change = round2(price - prev);
  const changePct = prev > 0 ? round2((change / prev) * 100) : 0;

  return { symbol, label, price, change, changePercent: changePct, isYield };
}

function buildDaySummary(tickers: TickerData[]): {
  message: string;
  bias: 'bullish' | 'bearish' | 'caution' | 'mixed';
  detail: string;
} {
  const byLabel = Object.fromEntries(tickers.map(t => [t.label, t]));
  const sp  = byLabel['S&P FUT'];
  const nq  = byLabel['NAS FUT'];
  const dow = byLabel['DOW FUT'];
  const vix = byLabel['VIX'];
  const tnx = byLabel['US 10-YR'];
  const oil = byLabel['OIL'];

  const futures = [sp, nq, dow].filter(Boolean);
  const greenCount = futures.filter(f => f.changePercent > 0).length;
  const redCount   = futures.length - greenCount;

  const vixHigh     = (vix?.price ?? 0) > 20;
  const vixSpike    = (vix?.price ?? 0) > 25;
  const ratesRising = (tnx?.changePercent ?? 0) > 0.5;
  const ratesDrop   = (tnx?.changePercent ?? 0) < -0.5;
  const oilUp       = (oil?.changePercent ?? 0) > 1;
  const oilDown     = (oil?.changePercent ?? 0) < -1;

  const extraNotes: string[] = [];
  if (vixSpike)    extraNotes.push(`VIX at ${vix?.price.toFixed(1)} — high fear, reduce size`);
  else if (vixHigh) extraNotes.push(`VIX elevated (${vix?.price.toFixed(1)}) — use tight stops`);
  if (ratesRising) extraNotes.push('Rates rising — headwind for tech/growth');
  if (ratesDrop)   extraNotes.push('Rates falling — tailwind for growth stocks');
  if (oilUp)       extraNotes.push('Oil surging — watch energy sector');
  if (oilDown)     extraNotes.push('Oil dropping — bearish macro signal');

  const extra = extraNotes.length > 0 ? ' · ' + extraNotes.join(' · ') : '';

  if (greenCount === 3) {
    return {
      bias: 'bullish',
      message: 'All futures green — bullish day bias. Favor long setups and breakouts.',
      detail: extra || ' · Follow the trend, trail your stops.',
    };
  }

  if (redCount === 3) {
    return {
      bias: 'caution',
      message: '⚠️ Careful trading day — all three futures red.',
      detail: ` Reduce position size, avoid buying weakness, wait for open confirmation.${extra}`,
    };
  }

  const greenNames = futures.filter(f => f.changePercent > 0).map(f => f.label);
  const redNames   = futures.filter(f => f.changePercent <= 0).map(f => f.label);

  if (greenCount === 2) {
    return {
      bias: 'mixed',
      message: `Mostly bullish — ${greenNames.join(' & ')} green, ${redNames.join(' & ')} lagging.`,
      detail: ` Wait for open to confirm direction before full size.${extra}`,
    };
  }

  return {
    bias: 'mixed',
    message: `Mixed signals — ${greenNames.join(' & ')} green, ${redNames.join(' & ')} red.`,
    detail: ` Choppy open likely — trade smaller, wait for first 15-min candle to set range.${extra}`,
  };
}

export async function GET() {
  try {
    const results = await Promise.allSettled(
      WATCH.map(w => fetchTicker(w.symbol, w.label, w.isYield)),
    );

    const tickers: TickerData[] = [];
    const errors: string[] = [];

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        tickers.push(r.value);
      } else {
        errors.push(`${WATCH[i].label}: ${r.reason?.message ?? 'failed'}`);
        // Push a zero-value placeholder so the banner layout stays consistent
        tickers.push({
          symbol:        WATCH[i].symbol,
          label:         WATCH[i].label,
          price:         0,
          change:        0,
          changePercent: 0,
          isYield:       WATCH[i].isYield,
        });
      }
    });

    const activeTickers = tickers.filter(t => t.price > 0);
    const summary = activeTickers.length >= 3
      ? buildDaySummary(activeTickers)
      : { message: 'Market data loading…', bias: 'mixed' as const, detail: '' };

    return NextResponse.json({
      success:   true,
      tickers,
      summary,
      fetchedAt: new Date().toISOString(),
      errors:    errors.length > 0 ? errors : undefined,
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Market banner fetch failed' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
