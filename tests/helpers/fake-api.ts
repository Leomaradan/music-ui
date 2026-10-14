import type { CatalogSnapshot } from '@/lib/catalog/snapshot';
import type { PlaylistDetail, PlaylistSummary } from '@/lib/playlists/types';

/**
 * In-memory stand-in for the app's own /api routes, for UI tests (jsdom) and stories (browser).
 * Browser-safe: no Node APIs. Install it as `fetch` and inspect `requests` afterwards.
 */
export interface FakeApiRequest {
  url: string;
  method: string;
  body: unknown;
}

export interface FakePlaylist {
  id: string;
  name: string;
  readonly?: boolean;
  trackIds: string[];
}

export interface SyncStatusFixture {
  state: 'idle' | 'syncing';
  trackCount: number;
}

export interface FakeApiOptions {
  /** Served by /api/catalog (304 when the client already has its version). */
  snapshot?: CatalogSnapshot | null;
  playlists?: FakePlaylist[];
  /** Saved play queue served by GET /api/queue. */
  queue?: { ids: string[]; index: number; position: number };
}

export class FakeApi {
  readonly requests: FakeApiRequest[] = [];
  playlists: FakePlaylist[];
  snapshot: CatalogSnapshot | null;
  queue: { ids: string[]; index: number; position: number };
  syncState: 'idle' | 'syncing' = 'idle';
  private nextId = 1;

  constructor(options: FakeApiOptions = {}) {
    this.snapshot = options.snapshot ?? null;
    this.playlists = structuredClone(options.playlists ?? []);
    this.queue = options.queue ?? { ids: [], index: -1, position: 0 };
    for (const p of this.playlists) {
      const n = Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0);
      if (n >= this.nextId) this.nextId = n + 1;
    }
  }

  /** Requests sent with `method` (and to `url`, when given). */
  sent(method: string, url?: string): FakeApiRequest[] {
    return this.requests.filter((r) => r.method === method && (url === undefined || r.url === url));
  }

  /** Replaces the global fetch; returns the function that puts the original back. */
  install(target: { fetch: typeof fetch } = globalThis): () => void {
    const original = target.fetch;
    target.fetch = this.fetch;
    return () => {
      target.fetch = original;
    };
  }

  readonly fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    this.requests.push({ url, method, body });
    return this.handle(url, method, body, new Headers(init?.headers));
  }) as typeof fetch;

  private summary(p: FakePlaylist): PlaylistSummary {
    return {
      id: p.id,
      name: p.name,
      songCount: p.trackIds.length,
      duration: 0,
      readonly: p.readonly ?? false,
      coverArt: null,
    };
  }

  private detail(p: FakePlaylist): PlaylistDetail {
    return { ...this.summary(p), trackIds: [...p.trackIds] };
  }

  private syncStatus() {
    return {
      state: this.syncState,
      progress:
        this.syncState === 'syncing'
          ? { phase: 'tracks', folder: 'Main', foldersDone: 0, foldersTotal: 2, tracks: 120 }
          : null,
      lastSync: { at: new Date(Date.now() - 5 * 60_000).toISOString(), version: 'v1' },
      lastRun: null,
      lastError: null,
      trackCount: this.snapshot?.tracks.id.length ?? 0,
    };
  }

  private handle(url: string, method: string, body: unknown, headers: Headers): Response {
    const path = url.split('?')[0]!;
    if (path === '/api/catalog') {
      if (!this.snapshot) return Response.json({ error: 'Not synced yet' }, { status: 503 });
      if (headers.get('if-none-match') === `"${this.snapshot.version}"`) {
        return new Response(null, { status: 304 });
      }
      return Response.json(this.snapshot);
    }
    if (path === '/api/catalog/status') return Response.json(this.syncStatus());
    if (path === '/api/catalog/rescan' && method === 'POST') {
      this.syncState = 'syncing';
      return Response.json(this.syncStatus(), { status: 202 });
    }
    if (path === '/api/health') {
      return Response.json({
        status: 'ok',
        subsonic: { reachable: true, server: 'navidrome 0.64.2' },
      });
    }
    if (path === '/api/queue') {
      if (method === 'PUT') {
        this.queue = body as typeof this.queue;
        return new Response(null, { status: 204 });
      }
      return Response.json(this.queue);
    }
    if (path === '/api/playlists/order' && method === 'PUT') {
      const order = (body as { ids: string[] }).ids;
      this.playlists.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      return new Response(null, { status: 204 });
    }
    if (path === '/api/playlists') {
      if (method === 'POST') {
        const { name, trackIds } = body as { name: string; trackIds: string[] };
        const playlist = { id: `p${this.nextId++}`, name, trackIds: [...trackIds] };
        this.playlists.push(playlist);
        return Response.json(this.summary(playlist), { status: 201 });
      }
      return Response.json({ playlists: this.playlists.map((p) => this.summary(p)) });
    }
    const match = /^\/api\/playlists\/([^/]+)$/.exec(path);
    const playlist = match && this.playlists.find((p) => p.id === decodeURIComponent(match[1]!));
    if (playlist) {
      if (method === 'DELETE') {
        this.playlists = this.playlists.filter((p) => p !== playlist);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        if (playlist.readonly) return Response.json({ error: 'Read-only' }, { status: 403 });
        const { name, add, remove } = body as { name?: string; add?: string[]; remove?: number[] };
        const removed = new Set(remove ?? []);
        playlist.trackIds = [
          ...playlist.trackIds.filter((_, i) => !removed.has(i)),
          ...(add ?? []),
        ];
        if (name) playlist.name = name;
      }
      return Response.json(this.detail(playlist));
    }
    return Response.json({ error: `No fake for ${method} ${path}` }, { status: 404 });
  }
}
