import { NextResponse, type NextRequest } from 'next/server';

// Accounts are switched off for now — every page is open to everyone. The
// old sign-in / subscription pages still exist in the repo but visitors are
// sent to the dashboard instead so nobody lands on a dead login form. The
// journal has been removed; old /journal links land on the dashboard too.
const ACCOUNT_PATHS = new Set([
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/subscribe',
  '/account',
  '/journal',
]);

export function middleware(request: NextRequest) {
  if (ACCOUNT_PATHS.has(request.nextUrl.pathname)) {
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
