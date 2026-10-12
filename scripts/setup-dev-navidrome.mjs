#!/usr/bin/env node
// Configures a fresh dev Navidrome (docker/compose.dev.yml) through its native API.
// Idempotent: safe to run again.
//   - admin account (admin/admin)
//   - library 1 renamed "Main", library "Live" added
//   - non-admin app user (music/music) with access to both libraries
// Env: NAVIDROME_URL (default http://localhost:4533),
//      MUSIC_ROOT = music path as seen by Navidrome (default /music)
import { createHash, randomBytes } from 'node:crypto';

const base = (process.env.NAVIDROME_URL ?? 'http://localhost:4533').replace(/\/$/, '');
const root = (process.env.MUSIC_ROOT ?? '/music').replace(/\/$/, '');
const ADMIN = { username: 'admin', password: 'admin' };
const APP_USER = { userName: 'music', name: 'Music UI', password: 'music' };
const LIBRARIES = [
  { name: 'Main', path: `${root}/main` },
  { name: 'Live', path: `${root}/live` },
];

async function json(method, path, { token, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-nd-authorization': `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  return { ok: response.ok, status: response.status, data };
}

async function adminToken() {
  const created = await json('POST', '/auth/createAdmin', { body: ADMIN });
  if (created.ok) {
    console.log('✓ admin created');
    return created.data.token;
  }
  const login = await json('POST', '/auth/login', { body: ADMIN });
  if (!login.ok) throw new Error(`admin login failed (HTTP ${login.status})`);
  console.log('✓ admin exists');
  return login.data.token;
}

async function ensureLibraries(token) {
  const { data: existing } = await json('GET', '/api/library', { token });
  for (const [index, wanted] of LIBRARIES.entries()) {
    const found =
      existing.find((lib) => lib.path === wanted.path) ?? (index === 0 ? existing[0] : undefined);
    if (found) {
      if (found.name !== wanted.name || !found.defaultNewUsers) {
        await json('PUT', `/api/library/${found.id}`, {
          token,
          body: { ...found, name: wanted.name, defaultNewUsers: true },
        });
      }
      console.log(`✓ library "${wanted.name}" (${found.id})`);
    } else {
      const res = await json('POST', '/api/library', {
        token,
        body: { ...wanted, defaultNewUsers: true },
      });
      if (!res.ok) throw new Error(`creating library ${wanted.name} failed (HTTP ${res.status})`);
      console.log(`✓ library "${wanted.name}" created (${res.data.id})`);
    }
  }
}

async function ensureAppUser(token) {
  const { data: users } = await json('GET', '/api/user', { token });
  if (users.some((user) => user.userName === APP_USER.userName)) {
    console.log(`✓ user "${APP_USER.userName}" exists`);
    return;
  }
  const res = await json('POST', '/api/user', { token, body: { ...APP_USER, isAdmin: false } });
  if (!res.ok) throw new Error(`creating user failed (HTTP ${res.status})`);
  console.log(`✓ user "${APP_USER.userName}" created`);
}

async function subsonic(method) {
  const salt = randomBytes(8).toString('hex');
  const token = createHash('md5')
    .update(APP_USER.password + salt)
    .digest('hex');
  const query = `u=${APP_USER.userName}&t=${token}&s=${salt}&v=1.16.1&c=setup&f=json`;
  const response = await fetch(`${base}/rest/${method}?${query}`);
  return (await response.json())['subsonic-response'];
}

async function waitForScan() {
  for (let i = 0; i < 60; i++) {
    const { scanStatus } = await subsonic('getScanStatus');
    if (!scanStatus.scanning) return scanStatus.count;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('scan did not finish in time');
}

const token = await adminToken();
await ensureLibraries(token);
await ensureAppUser(token);
const count = await waitForScan();
const folders = (await subsonic('getMusicFolders')).musicFolders.musicFolder;
console.log(
  `✓ ${count} tracks; user "${APP_USER.userName}" sees: ${folders.map((f) => f.name).join(', ')}`,
);
