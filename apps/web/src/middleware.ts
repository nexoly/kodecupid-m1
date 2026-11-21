import { NextResponse, type NextRequest } from 'next/server';

/**
 * Coarse cookie gate for navigation only. The API remains the source of truth:
 * an expired or forged cookie still gets a 401 from the server.
 *
 * Cookie names mirror `MEMBER_COOKIE` / `ADMIN_COOKIE` in packages/shared.
 */
// An access cookie, or the session marker set alongside the 30-day refresh
// cookie (the page then refreshes its expired access token on first call).
const MEMBER_COOKIES = ['kc_at', 'kc_s'];
const ADMIN_COOKIES = ['kc_admin_at', 'kc_admin_s'];

function hasAny(request: NextRequest, names: string[]): boolean {
  return names.some((name) => request.cookies.has(name));
}

const MEMBER_PREFIXES = ['/app', '/profile', '/settings', '/onboarding'];
const ADMIN_PUBLIC_PATHS = ['/admin/login', '/admin/accept-invite'];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    if (ADMIN_PUBLIC_PATHS.includes(pathname)) {
      return NextResponse.next();
    }
    if (!hasAny(request, ADMIN_COOKIES)) {
      const url = new URL('/admin/login', request.url);
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (MEMBER_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    if (!hasAny(request, MEMBER_COOKIES)) {
      const url = new URL('/login', request.url);
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/profile/:path*', '/settings/:path*', '/onboarding/:path*', '/admin/:path*'],
};
