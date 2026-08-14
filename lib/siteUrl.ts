/** Public origin used in auth emails. Must be reachable on a phone. */
const PRODUCTION_ORIGIN = 'https://tradevi.vercel.app';

export function getPublicSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return PRODUCTION_ORIGIN;
    }
    return origin;
  }
  return PRODUCTION_ORIGIN;
}

export function authCallbackUrl(next: string): string {
  return `${getPublicSiteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`;
}
