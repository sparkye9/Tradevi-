import { NextResponse } from 'next/server';
import crypto from 'crypto';

const KALSHI_BASE = 'https://api.elections.kalshi.com';

function getPrivateKey(): crypto.KeyObject {
  const raw = (process.env.KALSHI_KEY ?? '').trim();
  if (!raw) throw new Error('KALSHI_KEY env var not set.');
  // inline PEM
  if (raw.startsWith('-----')) {
    return crypto.createPrivateKey(raw);
  }
  throw new Error('KALSHI_KEY must be a PEM string starting with -----BEGIN');
}

function signedHeaders(pk: crypto.KeyObject, method: string, path: string) {
  const keyId = (process.env.KALSHI_KEY_ID ?? '').trim();
  if (!keyId) throw new Error('KALSHI_KEY_ID env var not set.');
  const ts = String(Date.now());
  const msg = Buffer.from(`${ts}${method}${path}`);
  const sig = crypto.sign('sha256', msg, {
    key: pk,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return {
    'KALSHI-ACCESS-KEY': keyId,
    'KALSHI-ACCESS-SIGNATURE': sig.toString('base64'),
    'KALSHI-ACCESS-TIMESTAMP': ts,
    'Content-Type': 'application/json',
  };
}

async function kalshiGet(pk: crypto.KeyObject, path: string, params?: Record<string, string>) {
  const url = new URL(KALSHI_BASE + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const headers = signedHeaders(pk, 'GET', path);
  const res = await fetch(url.toString(), { headers, next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Kalshi ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minGap = parseInt(searchParams.get('min_gap') ?? '3');

  let pk: crypto.KeyObject;
  try {
    pk = getPrivateKey();
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }

  try {
    // Fetch up to 5 pages of open markets
    const markets: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const params: Record<string, string> = { status: 'open', limit: '200' };
      if (cursor) params.cursor = cursor;
      const data = await kalshiGet(pk, '/trade-api/v2/markets', params);
      markets.push(...(data.markets ?? []));
      cursor = data.cursor;
      if (!cursor) break;
    }

    // Find gaps
    const results = markets
      .map((m) => {
        const yesAsk = m.yes_ask as number | null;
        const noAsk = m.no_ask as number | null;
        if (yesAsk == null || noAsk == null) return null;
        const gap = 100 - yesAsk - noAsk;
        if (gap < minGap) return null;
        return {
          ticker: m.ticker,
          title: m.title,
          yes_ask: yesAsk,
          no_ask: noAsk,
          gap: Math.round(gap * 10) / 10,
          is_arb: gap > 0,
          cheap_side: yesAsk <= noAsk ? 'yes' : 'no',
          cheap_ask: Math.min(yesAsk, noAsk),
          close_time: m.close_time,
          series_ticker: m.series_ticker,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.gap - a!.gap)
      .slice(0, 50);

    // Debug: show first market's raw keys so we can verify field names
    const firstRaw = markets[0] ?? null;
    return NextResponse.json({
      count: results.length,
      min_gap: minGap,
      markets: results,
      _debug: {
        total_fetched: markets.length,
        first_market_keys: firstRaw ? Object.keys(firstRaw) : [],
        first_market_sample: firstRaw,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
