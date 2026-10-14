import { NextResponse, type NextRequest } from 'next/server';
import { getAuthService, getRequestSession, sessionCookie } from '@/lib/auth';
import { jsonError } from '@/lib/http/responses';

/** Reachable without a session: the login screen, its API and the Docker healthcheck. */
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout', '/api/health']);

/**
 * Login wall (PLAN.md §6): every page and API route needs a session, unless AUTH_ENABLED is
 * false. Pages redirect to /login; API calls get a 401.
 */
export function proxy(request: NextRequest) {
  const service = getAuthService();
  const { pathname, search } = request.nextUrl;
  if (!service.enabled || PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const session = getRequestSession(request, service);
  if (!session) {
    if (pathname.startsWith('/api/')) return jsonError(401, 'Sign in required');
    const login = new URL('/login', request.url);
    if (pathname !== '/' || search) login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  if (session.renewed) {
    response.headers.append('set-cookie', sessionCookie(request, session.token, session.expires));
  }
  return response;
}

export const config = {
  // Everything except Next.js build assets and the app icon.
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
};
