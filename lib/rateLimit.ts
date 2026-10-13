/**
 * Best-effort per-IP token bucket for the expensive API routes (each one fans
 * out to many upstream Yahoo requests). On Vercel this lives in one function
 * instance's memory, so it limits bursts rather than enforcing a global quota;
 * use Vercel's firewall / an external store if a hard limit is ever needed.
 */
import { NextResponse } from 'next/server';

interface Bucket {
  tokens: number;
  updated: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export interface RateLimitOptions {
  /** Bucket capacity (burst). */
  capacity: number;
  /** Tokens refilled per minute. */
  perMinute: number;
}

/** Pure check used by the route helper and the tests. */
export function takeToken(key: string, opts: RateLimitOptions, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_KEYS) buckets.clear();
    b = { tokens: opts.capacity, updated: now };
    buckets.set(key, b);
  }
  const refill = ((now - b.updated) / 60_000) * opts.perMinute;
  b.tokens = Math.min(opts.capacity, b.tokens + refill);
  b.updated = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, retryAfterSec: 0 };
  }
  const retryAfterSec = Math.ceil(((1 - b.tokens) / opts.perMinute) * 60);
  return { allowed: false, retryAfterSec };
}

export function clientKey(request: Request, scope: string): string {
  const fwd = request.headers.get('x-forwarded-for') ?? '';
  const ip = fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export function rateLimit(request: Request, scope: string, opts: RateLimitOptions): NextResponse | null {
  const { allowed, retryAfterSec } = takeToken(clientKey(request, scope), opts);
  if (allowed) return null;
  return NextResponse.json(
    { error: `Too many requests — try again in ${retryAfterSec}s.` },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}
