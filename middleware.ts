import { NextResponse, type NextRequest } from 'next/server';

// The site is open to everyone — accounts, subscriptions and the journal have
// been removed. Old links to those pages (bookmarks, emails) land on the
// dashboard instead of a 404.
const REMOVED_PATHS = new Set([
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/subscribe',
  '/account',
  '/journal',
]);

export function middleware(request: NextRequest) {
  if (REMOVED_PATHS.has(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/login', '/signup', '/forgot-password', '/reset-password', '/subscribe', '/account', '/journal'],
};
