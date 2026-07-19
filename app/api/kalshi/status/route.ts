import { NextResponse } from 'next/server';

export async function GET() {
  const key = (process.env.KALSHI_KEY ?? '').trim();
  const keyId = (process.env.KALSHI_KEY_ID ?? '').trim();
  const keyOk = key.startsWith('-----BEGIN');
  return NextResponse.json({
    ready: keyOk && !!keyId,
    key_found: keyOk,
    key_id_set: !!keyId,
    hint: keyOk && keyId ? null : 'Set KALSHI_KEY (PEM content) and KALSHI_KEY_ID in Vercel env vars.',
  });
}
