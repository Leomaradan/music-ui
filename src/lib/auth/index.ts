import 'server-only';
import { hashPassword, verifyPassword } from '../../../scripts/password.mjs';
import { getDatabase } from '@/lib/database';
import { getEnv } from '@/lib/env';
import { AuthRepository, type Session } from './repository';
import { LoginThrottle } from './throttle';

export { AuthRepository, type Session } from './repository';
export { LoginThrottle } from './throttle';

export const SESSION_COOKIE = 'music_ui_session';

// Shared through globalThis: the proxy and the route handlers are bundled separately.
const SERVICE = Symbol.for('music-ui.auth.service');
type Globals = typeof globalThis & { [SERVICE]?: AuthService };

export interface AuthService {
  enabled: boolean;
  sessionDays: number;
  repository: AuthRepository;
  throttle: LoginThrottle;
  /** The canonical username when the password matches, otherwise null. */
  authenticate(username: string, password: string): Promise<string | null>;
}

export function createAuthService(
  repository: AuthRepository,
  options: { enabled: boolean; sessionDays: number; throttle?: LoginThrottle },
): AuthService {
  // Checked when the user does not exist, so that the answer takes as long either way.
  let decoy: Promise<string> | undefined;
  return {
    ...options,
    repository,
    throttle: options.throttle ?? new LoginThrottle(),
    async authenticate(username, password) {
      const user = repository.findUser(username);
      decoy ??= hashPassword('decoy password');
      const ok = await verifyPassword(password, user?.passwordHash ?? (await decoy));
      return ok && user ? user.username : null;
    },
  };
}

export function getAuthService(): AuthService {
  const globals = globalThis as Globals;
  if (!globals[SERVICE]) {
    const env = getEnv();
    const repository = new AuthRepository(getDatabase());
    if (env.AUTH_ENABLED) repository.deleteExpiredSessions();
    globals[SERVICE] = createAuthService(repository, {
      enabled: env.AUTH_ENABLED,
      sessionDays: env.SESSION_DAYS,
    });
  }
  return globals[SERVICE];
}

/** Reads a cookie from a raw `Cookie` header. */
export function readCookie(header: string | null, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

/** The session of a request's cookie, or null. */
export function getRequestSession(
  request: Request,
  service = getAuthService(),
): (Session & { renewed: boolean; token: string }) | null {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  if (!token) return null;
  const session = service.repository.getSession(token, service.sessionDays);
  return session ? { ...session, token } : null;
}

/** `Set-Cookie` value for a session token (`expires` null clears the cookie). */
export function sessionCookie(request: Request, token: string, expires: string | null): string {
  const secure = isHttps(request) ? '; Secure' : '';
  const lifetime = expires
    ? `; Expires=${new Date(expires).toUTCString()}`
    : '; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${lifetime}${secure}`;
}

/** HTTPS directly or behind a reverse proxy (the app itself serves plain HTTP on the LAN). */
function isHttps(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return (forwarded ?? new URL(request.url).protocol.replace(':', '')) === 'https';
}

/** Where to go after logging in: a path of this app only (no open redirect). */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }
  return value;
}
