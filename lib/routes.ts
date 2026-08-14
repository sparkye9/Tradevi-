/** Canonical in-app destinations after login / subscribe. */
export const DEFAULT_APP_PATH = '/futures';

export function safeNextPath(next: string | null | undefined): string {
  if (next && next.startsWith('/') && !next.startsWith('//') && next !== '/login') {
    return next;
  }
  return DEFAULT_APP_PATH;
}
