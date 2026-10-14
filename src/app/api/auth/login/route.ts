import { z } from 'zod';
import { getAuthService, sessionCookie } from '@/lib/auth';
import { jsonError } from '@/lib/http/responses';

export const runtime = 'nodejs';

const schema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(1024),
});

/** Checks a username and password and starts a session (cookie). */
export async function POST(request: Request) {
  const auth = getAuthService();
  if (!auth.enabled) return jsonError(404, 'Authentication is disabled');
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Expected { username, password }');
  const { username, password } = parsed.data;

  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const key = `${client}|${username.toLowerCase()}`;
  const retryAfter = auth.throttle.retryAfter(key);
  if (retryAfter > 0) {
    return Response.json(
      { error: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} min.` },
      { status: 429, headers: { 'retry-after': String(retryAfter), 'cache-control': 'no-store' } },
    );
  }

  const user = await auth.authenticate(username, password);
  if (!user) {
    auth.throttle.fail(key);
    return jsonError(401, 'Wrong username or password');
  }
  auth.throttle.succeed(key);
  const { token, expires } = auth.repository.createSession(user, auth.sessionDays);
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': sessionCookie(request, token, expires), 'cache-control': 'no-store' },
  });
}
