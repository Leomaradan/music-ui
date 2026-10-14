import { getAuthService, readCookie, SESSION_COOKIE, sessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';

/** Ends the session and clears its cookie. */
export function POST(request: Request) {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  if (token) getAuthService().repository.deleteSession(token);
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': sessionCookie(request, '', null), 'cache-control': 'no-store' },
  });
}
