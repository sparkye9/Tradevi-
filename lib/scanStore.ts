// lib/scanStore.ts — persists the daily universe scan so a page load doesn't
// have to wait on (or re-trigger) a full Finviz scan every time.
//
// Vercel serverless functions don't share memory between invocations, so the
// in-memory cache in lib/finviz.ts only survives while a given instance stays
// warm — the 4 AM cron run and a user's page load later that day can easily
// land on different instances. This adds real persistence via Upstash Redis,
// which is what Vercel's own "KV" storage product is built on: connecting a
// KV/Upstash database from the Vercel dashboard (Storage tab) auto-injects
// KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN if
// connected directly through Upstash) — no other setup needed.
//
// If neither is configured yet, this falls back to the same in-memory cache
// that existed before, so the app keeps working; it just won't survive a
// cold start. meta.persisted on the API response tells you which mode you're
// in.
import { Redis } from '@upstash/redis';
import type { UniverseScanResult } from './universe';

const SCAN_KEY = 'tradevi:universe-scan:latest';
const SCAN_TTL_SECONDS = 24 * 60 * 60; // expire stale data if the cron ever stops firing

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// In-memory fallback — same caveat as every other cache in this codebase:
// only survives while this particular serverless instance stays warm.
let memoryFallback: UniverseScanResult | null = null;

export function isPersistenceConfigured(): boolean {
  return getRedis() !== null;
}

export async function saveUniverseScan(result: UniverseScanResult): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    memoryFallback = result;
    return;
  }
  try {
    await redis.set(SCAN_KEY, JSON.stringify(result), { ex: SCAN_TTL_SECONDS });
  } catch {
    // Redis unreachable — still keep the in-process fallback so this request
    // (and any others that land on the same warm instance) aren't empty-handed.
    memoryFallback = result;
  }
}

export async function loadUniverseScan(): Promise<UniverseScanResult | null> {
  const redis = getRedis();
  if (!redis) return memoryFallback;
  try {
    const raw = await redis.get<string | UniverseScanResult>(SCAN_KEY);
    if (!raw) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as UniverseScanResult) : raw;
  } catch {
    return memoryFallback;
  }
}
