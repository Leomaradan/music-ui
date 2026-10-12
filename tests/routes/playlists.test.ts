// @vitest-environment node
import { jsonResponse } from '../helpers/fixtures';
import { DELETE, GET as getOne, PATCH } from '@/app/api/playlists/[id]/route';
import { PUT as putOrder } from '@/app/api/playlists/order/route';
import { GET as list, POST as create } from '@/app/api/playlists/route';
import { AppStateRepository } from '@/lib/appState';
import { createCatalogService } from '@/lib/catalog';
import { CatalogRepository } from '@/lib/catalog/repository';
import { CatalogSync } from '@/lib/catalog/sync';
import { openDatabase } from '@/lib/db';
import { SubsonicClient } from '@/lib/subsonic/client';

const CLIENT = Symbol.for('music-ui.subsonic.client');
const SERVICE = Symbol.for('music-ui.catalog.service');
const globals = globalThis as Record<symbol, unknown>;

type Call = { method: string; params: URLSearchParams; httpMethod: string };

const ok = (body: Record<string, unknown> = {}) =>
  jsonResponse({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...body } });

/** A tiny in-memory Navidrome playlist service. */
function installServer() {
  const playlists = new Map<string, { name: string; songs: string[]; created: string }>();
  let nextId = 1;
  const calls: Call[] = [];
  const summary = (id: string) => {
    const p = playlists.get(id)!;
    return {
      id,
      name: p.name,
      songCount: p.songs.length,
      duration: p.songs.length * 8,
      owner: 'music',
      created: p.created,
      readonly: false,
    };
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    const params = init?.body ? new URLSearchParams(String(init.body)) : url.searchParams;
    const method = url.pathname.replace('/rest/', '');
    calls.push({ method, params, httpMethod: init?.method ?? 'GET' });
    const id = params.get('id') ?? params.get('playlistId') ?? '';
    switch (method) {
      case 'getPlaylists':
        return ok({ playlists: { playlist: [...playlists.keys()].map(summary) } });
      case 'getPlaylist':
        if (!playlists.has(id))
          return jsonResponse({
            'subsonic-response': {
              status: 'failed',
              version: '1.16.1',
              error: { code: 70, message: 'playlist not found' },
            },
          });
        return ok({
          playlist: {
            ...summary(id),
            entry: playlists.get(id)!.songs.map((s) => ({ id: s, title: s })),
          },
        });
      case 'createPlaylist': {
        const newId = `pl${nextId++}`;
        playlists.set(newId, {
          name: params.get('name') ?? '',
          songs: params.getAll('songId'),
          created: `2026-01-0${nextId}`,
        });
        return ok({ playlist: { ...summary(newId), entry: [] } });
      }
      case 'updatePlaylist': {
        const p = playlists.get(id)!;
        const remove = new Set(params.getAll('songIndexToRemove').map(Number));
        p.songs = [...p.songs.filter((_, i) => !remove.has(i)), ...params.getAll('songIdToAdd')];
        if (params.get('name')) p.name = params.get('name')!;
        return ok();
      }
      case 'deletePlaylist':
        playlists.delete(id);
        return ok();
      default:
        throw new Error(method);
    }
  }) as typeof fetch;
  globals[CLIENT] = new SubsonicClient({
    baseUrl: 'http://nd',
    username: 'music',
    password: 'pw',
    fetch: fetchImpl,
  });
  const db = openDatabase(':memory:');
  const repository = new CatalogRepository(db);
  const appState = new AppStateRepository(db);
  globals[SERVICE] = createCatalogService(
    repository,
    new CatalogSync({ client: globals[CLIENT] as SubsonicClient, repository }),
    appState,
  );
  return { playlists, calls, appState };
}

afterEach(() => {
  delete globals[CLIENT];
  delete globals[SERVICE];
});

const json = (body: unknown, method: 'POST' | 'PATCH' = 'POST') =>
  new Request('http://app/api/playlists', { method, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const names = async () =>
  ((await (await list()).json()) as { playlists: { name: string }[] }).playlists.map((p) => p.name);

describe('/api/playlists', () => {
  it('creates playlists with tracks (form POST), listed last', async () => {
    const { calls } = installServer();
    const response = await create(json({ name: 'Road trip', trackIds: ['a', 'b', 'a'] }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: 'pl1',
      name: 'Road trip',
      songCount: 3,
      readonly: false,
    });
    const call = calls.find((c) => c.method === 'createPlaylist')!;
    expect(call.httpMethod).toBe('POST');
    expect(call.params.getAll('songId')).toEqual(['a', 'b', 'a']);

    await create(json({ name: 'Chill' }));
    expect(await names()).toEqual(['Road trip', 'Chill']);
  });

  it('keeps the saved order, playlists made elsewhere come after', async () => {
    const { playlists } = installServer();
    await create(json({ name: 'A' }));
    await create(json({ name: 'B' }));
    expect(
      (
        await putOrder(
          new Request('http://app', {
            method: 'PUT',
            body: JSON.stringify({ ids: ['pl2', 'pl1'] }),
          }),
        )
      ).status,
    ).toBe(204);
    playlists.set('other', { name: 'From another app', songs: [], created: '2025-12-01' });
    expect(await names()).toEqual(['B', 'A', 'From another app']);
  });

  it('reads, renames, appends and removes by position', async () => {
    installServer();
    await create(json({ name: 'Mix', trackIds: ['a', 'b', 'c'] }));
    expect(await (await getOne(new Request('http://app'), ctx('pl1'))).json()).toMatchObject({
      name: 'Mix',
      trackIds: ['a', 'b', 'c'],
    });

    const patched = await PATCH(
      json({ name: 'Best of', add: ['d', 'a'], remove: [0, 2] }, 'PATCH'),
      ctx('pl1'),
    );
    expect(await patched.json()).toMatchObject({
      name: 'Best of',
      songCount: 3,
      trackIds: ['b', 'd', 'a'],
    });
  });

  it('deletes and forgets the position', async () => {
    const { appState } = installServer();
    await create(json({ name: 'A' }));
    await create(json({ name: 'B' }));
    expect((await DELETE(new Request('http://app'), ctx('pl1'))).status).toBe(204);
    expect(appState.get('playlistOrder')).toEqual(['pl2']);
    expect((await getOne(new Request('http://app'), ctx('pl1'))).status).toBe(404);
  });

  it.each([
    ['empty name', () => create(json({ name: '  ' }))],
    ['bad track id', () => create(json({ name: 'x', trackIds: ['a b'] }))],
    ['nothing to change', () => PATCH(json({}, 'PATCH'), ctx('pl1'))],
    ['bad position', () => PATCH(json({ remove: [-1] }, 'PATCH'), ctx('pl1'))],
    ['bad id', () => getOne(new Request('http://app'), ctx('../x'))],
    [
      'bad order',
      () => putOrder(new Request('http://app', { method: 'PUT', body: '{"ids":"x"}' })),
    ],
  ])('refuses %s', async (_label, call) => {
    const { calls } = installServer();
    expect((await call()).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
