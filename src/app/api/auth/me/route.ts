import { getAuthService, getRequestSession } from '@/lib/auth';

export const runtime = 'nodejs';

/** Whether the login is enabled, and who is signed in. */
export function GET(request: Request) {
  const auth = getAuthService();
  const username = auth.enabled ? (getRequestSession(request, auth)?.username ?? null) : null;
  return Response.json(
    { enabled: auth.enabled, username },
    { headers: { 'cache-control': 'no-store' } },
  );
}
