// @vitest-environment node
import { hashPassword, verifyPassword } from '../../../scripts/password.mjs';
import { openDatabase } from '@/lib/db';
import {
  AuthRepository,
  createAuthService,
  LoginThrottle,
  readCookie,
  safeNextPath,
  sessionCookie,
} from '.';

const DAY = 86_400_000;

async function setup(now = { t: Date.parse('2026-01-01T00:00:00Z') }) {
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO users (username, passwordHash, created) VALUES ('Alice', ?, '')").run(
    await hashPassword('correct-horse'),
  );
  const repository = new AuthRepository(db, () => new Date(now.t));
  return { db, now, repository };
}

describe('passwords', () => {
  it('verifies the right password only', async () => {
    const hash = await hashPassword('correct-horse');
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword('correct-horse', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await hashPassword('correct-horse')).not.toBe(hash);
  });

  it('never matches a malformed hash', async () => {
    for (const stored of ['', 'plain', 'scrypt$x$8$1$abc$def', 'bcrypt$1$2$3$a$b']) {
      expect(await verifyPassword('anything', stored)).toBe(false);
    }
  });
});

describe('AuthRepository', () => {
  it('finds users case-insensitively', async () => {
    const { repository } = await setup();
    expect(repository.userCount()).toBe(1);
    expect(repository.findUser('alice')?.username).toBe('Alice');
    expect(repository.findUser('bob')).toBeUndefined();
  });

  it('stores only a hash of the session token', async () => {
    const { db, repository } = await setup();
    const { token } = repository.createSession('Alice', 30);
    const rows = db.prepare('SELECT tokenHash FROM sessions').all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(token);
    expect(repository.getSession(token, 30)).toMatchObject({ username: 'Alice', renewed: false });
    expect(repository.getSession('forged', 30)).toBeNull();
  });

  it('extends a session past half of its life, and drops expired ones', async () => {
    const { now, repository } = await setup();
    const { token, expires } = repository.createSession('Alice', 30);
    expect(expires).toBe('2026-01-31T00:00:00.000Z');

    now.t += 20 * DAY;
    const renewed = repository.getSession(token, 30);
    expect(renewed).toMatchObject({ renewed: true, expires: '2026-02-20T00:00:00.000Z' });

    now.t += 31 * DAY;
    expect(repository.getSession(token, 30)).toBeNull();
  });

  it('ends a session on logout and when its user is removed', async () => {
    const { db, repository } = await setup();
    const first = repository.createSession('Alice', 30).token;
    const second = repository.createSession('Alice', 30).token;
    repository.deleteSession(first);
    expect(repository.getSession(first, 30)).toBeNull();
    db.prepare("DELETE FROM users WHERE username = 'alice'").run();
    expect(repository.getSession(second, 30)).toBeNull();
  });
});

describe('createAuthService().authenticate', () => {
  it('returns the canonical username for valid credentials only', async () => {
    const { repository } = await setup();
    const auth = createAuthService(repository, { enabled: true, sessionDays: 30 });
    expect(await auth.authenticate('alice', 'correct-horse')).toBe('Alice');
    expect(await auth.authenticate('alice', 'wrong')).toBeNull();
    expect(await auth.authenticate('nobody', 'correct-horse')).toBeNull();
  });
});

describe('LoginThrottle', () => {
  it('refuses attempts after too many failures, until the window ends', () => {
    let t = 0;
    const throttle = new LoginThrottle(3, 60_000, () => t);
    for (let i = 0; i < 3; i++) {
      expect(throttle.retryAfter('k')).toBe(0);
      throttle.fail('k');
    }
    expect(throttle.retryAfter('k')).toBe(60);
    expect(throttle.retryAfter('other')).toBe(0);
    t = 30_000;
    expect(throttle.retryAfter('k')).toBe(30);
    t = 60_000;
    expect(throttle.retryAfter('k')).toBe(0);
  });

  it('forgets failures after a success', () => {
    const throttle = new LoginThrottle(2, 60_000, () => 0);
    throttle.fail('k');
    throttle.succeed('k');
    throttle.fail('k');
    expect(throttle.retryAfter('k')).toBe(0);
  });
});

describe('cookies and redirects', () => {
  it('reads a cookie from the header', () => {
    expect(readCookie('a=1; music_ui_session=abc; b=2', 'music_ui_session')).toBe('abc');
    expect(readCookie(null, 'music_ui_session')).toBeUndefined();
  });

  it('marks the cookie Secure only over HTTPS', () => {
    const http = sessionCookie(new Request('http://nas:3000/'), 't', '2026-01-31T00:00:00Z');
    expect(http).toBe(
      'music_ui_session=t; Path=/; HttpOnly; SameSite=Lax; Expires=Sat, 31 Jan 2026 00:00:00 GMT',
    );
    const proxied = new Request('http://nas:3000/', { headers: { 'x-forwarded-proto': 'https' } });
    expect(sessionCookie(proxied, 't', null)).toMatch(/Expires=Thu, 01 Jan 1970.*; Secure$/);
  });

  it('only redirects within the app after login', () => {
    expect(safeNextPath('/?view=queue')).toBe('/?view=queue');
    for (const value of [undefined, '', 'https://evil.example', '//evil.example', '/\\evil']) {
      expect(safeNextPath(value)).toBe('/');
    }
  });
});
