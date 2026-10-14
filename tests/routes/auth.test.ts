// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { hashPassword } from '../../scripts/password.mjs';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';
import { AuthRepository, createAuthService, LoginThrottle, type AuthService } from '@/lib/auth';
import { openDatabase } from '@/lib/db';
import { proxy } from '@/proxy';

const SERVICE = Symbol.for('music-ui.auth.service');
const globals = globalThis as Record<symbol, unknown>;

let auth: AuthService;

async function install(enabled = true) {
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO users (username, passwordHash, created) VALUES ('alice', ?, '')").run(
    await hashPassword('correct-horse'),
  );
  auth = createAuthService(new AuthRepository(db), {
    enabled,
    sessionDays: 30,
    throttle: new LoginThrottle(3),
  });
  globals[SERVICE] = auth;
}

afterEach(() => {
  delete globals[SERVICE];
});

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://nas:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const cookieOf = (response: Response) => response.headers.get('set-cookie')?.split(';')[0] ?? '';

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://nas:3000${path}`, cookie ? { headers: { cookie } } : {});

const wrongLogin = () =>
  login(
    post(
      '/api/auth/login',
      { username: 'alice', password: 'nope' },
      { 'x-forwarded-for': '10.0.0.9' },
    ),
  );

async function signIn(): Promise<string> {
  const response = await login(
    post('/api/auth/login', { username: 'Alice', password: 'correct-horse' }),
  );
  expect(response.status).toBe(204);
  return cookieOf(response);
}

describe('auth routes', () => {
  beforeEach(() => install());

  it('signs in, reports the user and signs out', async () => {
    const cookie = await signIn();
    expect(cookie).toMatch(/^music_ui_session=[\w-]{43}$/);

    const who = await me(new Request('http://nas:3000/api/auth/me', { headers: { cookie } }));
    expect(await who.json()).toEqual({ enabled: true, username: 'alice' });

    const out = await logout(post('/api/auth/logout', {}, { cookie }));
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toMatch(/^music_ui_session=; .*Expires=Thu, 01 Jan 1970/);
    const after = await me(new Request('http://nas:3000/api/auth/me', { headers: { cookie } }));
    expect(await after.json()).toEqual({ enabled: true, username: null });
  });

  it('refuses wrong credentials, then throttles', async () => {
    for (let i = 0; i < 3; i++) {
      const response = await wrongLogin();
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Wrong username or password' });
    }
    const blocked = await wrongLogin();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    // Another address is not affected.
    expect(await signIn()).not.toBe('');
  });

  it('validates the body', async () => {
    expect((await login(post('/api/auth/login', { username: '' }))).status).toBe(400);
  });
});

describe('proxy', () => {
  beforeEach(() => install());

  it('redirects pages to the login screen without a session', () => {
    const home = proxy(request('/'));
    expect(home.status).toBe(307);
    expect(home.headers.get('location')).toBe('http://nas:3000/login');
    const deep = proxy(request('/?view=queue'));
    expect(deep.headers.get('location')).toBe('http://nas:3000/login?next=%2F%3Fview%3Dqueue');
  });

  it('answers 401 to API calls without a session', async () => {
    const response = proxy(request('/api/catalog'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Sign in required' });
    expect(proxy(request('/api/stream/abc', 'music_ui_session=forged')).status).toBe(401);
  });

  it('lets public paths through', () => {
    for (const path of ['/login', '/api/auth/login', '/api/auth/logout', '/api/health']) {
      expect(proxy(request(path)).headers.get('x-middleware-next')).toBe('1');
    }
  });

  it('lets signed-in requests through', async () => {
    const cookie = await signIn();
    for (const path of ['/', '/api/catalog', '/api/stream/abc']) {
      expect(proxy(request(path, cookie)).headers.get('x-middleware-next')).toBe('1');
    }
  });

  it('does nothing when AUTH_ENABLED is false', async () => {
    await install(false);
    expect(proxy(request('/api/catalog')).headers.get('x-middleware-next')).toBe('1');
    expect(
      (await login(post('/api/auth/login', { username: 'alice', password: 'x' }))).status,
    ).toBe(404);
    const who = await me(new Request('http://nas:3000/api/auth/me'));
    expect(await who.json()).toEqual({ enabled: false, username: null });
  });
});

describe('cli.mjs', () => {
  let dir: string;
  const cli = (args: string[], input?: string) =>
    spawnSync(process.execPath, ['scripts/cli.mjs', ...args], {
      env: { ...process.env, DATA_DIR: dir },
      input,
      encoding: 'utf8',
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'music-ui-cli-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('asks to start the app first when there is no database', () => {
    const result = cli(['user', 'list']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Start the app once/);
  });

  it('manages users the server can authenticate', async () => {
    openDatabase(join(dir, 'music-ui.db')).close();

    expect(cli(['user', 'add', 'bob'], 'short\n').stderr).toMatch(/at least 8 characters/);
    const added = cli(['user', 'add', 'bob'], 'correct-horse\n');
    expect(added.stdout).toBe('Created "bob".\n');
    expect(cli(['user', 'add', 'BOB'], 'correct-horse\n').stderr).toMatch(/already exists/);
    expect(cli(['user', 'add', 'bad name'], 'correct-horse\n').stderr).toMatch(/A username has/);
    expect(cli(['user', 'list']).stdout).toMatch(/^bob\tcreated .*\t0 session\(s\)\n$/);

    const db = openDatabase(join(dir, 'music-ui.db'));
    const service = createAuthService(new AuthRepository(db), { enabled: true, sessionDays: 30 });
    expect(await service.authenticate('bob', 'correct-horse')).toBe('bob');
    service.repository.createSession('bob', 30);

    expect(cli(['user', 'passwd', 'bob'], 'battery-staple\n').stdout).toMatch(/signed them out/);
    expect(await service.authenticate('bob', 'battery-staple')).toBe('bob');
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });

    expect(cli(['user', 'remove', 'bob']).stdout).toBe('Removed "bob".\n');
    expect(cli(['user', 'remove', 'bob']).stderr).toMatch(/No user named/);
    db.close();
  });
});
