import { NextResponse } from 'next/server';
import crypto from 'crypto';

const KALSHI_BASE = 'https://api.elections.kalshi.com';

function getPrivateKey() {
  const raw = (process.env.KALSHI_KEY ?? '').trim();
  if (!raw) throw new Error('KALSHI_KEY not set');
  if (raw.startsWith('-----')) return crypto.createPrivateKey(raw);
  throw new Error('KALSHI_KEY must be PEM');
}

function signedHeaders(pk: crypto.KeyObject, method: string, path: string) {
  const keyId = (process.env.KALSHI_KEY_ID ?? '').trim();
  if (!keyId) throw new Error('KALSHI_KEY_ID not set');
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

export async function GET() {
  let pk: crypto.KeyObject;
  try { pk = getPrivateKey(); } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }

  const path = '/trade-api/v2/markets';
  const url = new URL(KALSHI_BASE + path);
  url.searchParams.set('status', 'open');
  url.searchParams.set('limit', '3');

  const headers = signedHeaders(pk, 'GET', path);
  const res = await fetch(url.toString(), { headers, next: { revalidate: 0 } });
  const body = await res.json();

  // Return raw response + first market's keys so we can see the structure
  const first = body.markets?.[0] ?? null;
  return NextResponse.json({
    status: res.status,
    total_markets: body.markets?.length ?? 0,
    cursor: body.cursor ?? null,
    first_market_keys: first ? Object.keys(first) : [],
    first_market: first,
  });
}
