import { SubsonicClient } from '@/lib/subsonic/client';
import { jsonResponse, navidromeFixture } from './fixtures';

type Json = Record<string, unknown>;

function payload(fixture: string): Json {
  return (navidromeFixture(fixture) as Json)['subsonic-response'] as Json & Record<string, Json>;
}

function ok(body: Json): Response {
  return jsonResponse({
    'subsonic-response': {
      status: 'ok',
      version: '1.16.1',
      type: 'navidrome',
      serverVersion: '0.64.2',
      openSubsonic: true,
      ...body,
    },
  });
}

/**
 * In-memory Navidrome built from the captured two-library fixtures ("Main" = 1, "Live" = 2).
 * Supports paging and musicFolderId like the real server. Mutable to simulate changes.
 */
export class FakeNavidrome {
  folders = [
    { id: 1, name: 'Main' },
    { id: 2, name: 'Live' },
  ];
  songs = new Map<number, Json[]>();
  albums = new Map<number, Json[]>();
  scanning = false;
  lastScan = '2026-10-12T07:21:40.519Z';
  lastModified = 1791789700000;
  /** Methods called, in order. */
  calls: string[] = [];
  /** Number of upcoming calls to a method that fail with a network error. */
  failures: Record<string, number> = {};

  constructor() {
    for (const { id } of this.folders) {
      const search = payload(`library-${id}-search3`).searchResult3 as Json;
      const list = payload(`library-${id}-getAlbumList2`).albumList2 as Json;
      this.songs.set(id, search.song as Json[]);
      this.albums.set(id, list.album as Json[]);
    }
  }

  client(): SubsonicClient {
    return new SubsonicClient({
      baseUrl: 'http://navidrome:4533',
      username: 'music',
      password: 'music',
      fetch: (async (input: RequestInfo | URL) =>
        this.handle(new URL(input.toString()))) as typeof fetch,
    });
  }

  private scoped(map: Map<number, Json[]>, params: URLSearchParams): Json[] {
    const ids = params.getAll('musicFolderId').map(Number);
    const folders = ids.length ? ids : this.folders.map((folder) => folder.id);
    return folders.flatMap((id) => map.get(id) ?? []);
  }

  private handle(url: URL): Response {
    const method = url.pathname.replace('/rest/', '');
    this.calls.push(method);
    if ((this.failures[method] ?? 0) > 0) {
      this.failures[method]! -= 1;
      throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    }
    const params = url.searchParams;
    const int = (name: string, fallback: number) => Number(params.get(name) ?? fallback);
    switch (method) {
      case 'getMusicFolders':
        return ok({ musicFolders: { musicFolder: this.folders } });
      case 'getScanStatus':
        return ok({ scanStatus: { scanning: this.scanning, count: 10, lastScan: this.lastScan } });
      case 'getIndexes':
        return ok({ indexes: { lastModified: this.lastModified, index: [] } });
      case 'search3': {
        const offset = int('songOffset', 0);
        const song = this.scoped(this.songs, params).slice(offset, offset + int('songCount', 20));
        return ok({ searchResult3: song.length ? { song } : {} });
      }
      case 'getAlbumList2': {
        const offset = int('offset', 0);
        const album = this.scoped(this.albums, params).slice(offset, offset + int('size', 10));
        return ok({ albumList2: album.length ? { album } : {} });
      }
      default:
        return ok({ status: 'failed', error: { code: 0, message: `${method} not faked` } });
    }
  }
}
