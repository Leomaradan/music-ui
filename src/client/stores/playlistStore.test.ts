import { freePlaylistName, usePlaylistStore } from './playlistStore';
import { useNotificationStore } from './notificationStore';
import { useViewStore } from './viewStore';

const initial = usePlaylistStore.getState();
const store = () => usePlaylistStore.getState();
const summary = (id: string, name: string, songCount = 0) => ({
  id,
  name,
  songCount,
  duration: 0,
  readonly: false,
  coverArt: null,
});

let requests: { url: string; method: string; body: unknown }[];

function mockApi(handler: (url: string, method: string, body: unknown) => Response) {
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });
      return handler(url, method, body);
    }),
  );
}

beforeEach(() => {
  usePlaylistStore.setState(initial, true);
  useNotificationStore.setState({ current: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('freePlaylistName', () => {
  it('picks the first free "New playlist N"', () => {
    expect(freePlaylistName([])).toBe('New playlist');
    expect(freePlaylistName(['new playlist', 'New playlist 2'])).toBe('New playlist 3');
  });
});

describe('playlistStore', () => {
  it('creates a playlist with a free name and opens its rename field', async () => {
    usePlaylistStore.setState({ playlists: [summary('p1', 'New playlist')] });
    mockApi(() => Response.json(summary('p2', 'New playlist 2', 2), { status: 201 }));
    await store().create(['a', 'b']);
    expect(requests[0]).toEqual({
      url: '/api/playlists',
      method: 'POST',
      body: { name: 'New playlist 2', trackIds: ['a', 'b'] },
    });
    expect(store()).toMatchObject({ renamingId: 'p2', tracks: { p2: ['a', 'b'] } });
    expect(store().playlists.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(useNotificationStore.getState().current?.message).toBe(
      'Created "New playlist 2" with 2 tracks',
    );
  });

  it('appends tracks and refreshes from the answer', async () => {
    usePlaylistStore.setState({ playlists: [summary('p1', 'Mix', 1)] });
    mockApi(() => Response.json({ ...summary('p1', 'Mix', 3), trackIds: ['x', 'a', 'b'] }));
    await store().append('p1', ['a', 'b']);
    expect(requests[0]).toMatchObject({
      url: '/api/playlists/p1',
      method: 'PATCH',
      body: { add: ['a', 'b'] },
    });
    expect(store().playlists[0]?.songCount).toBe(3);
    expect(store().tracks.p1).toEqual(['x', 'a', 'b']);
  });

  it('ignores drops on read-only playlists', async () => {
    usePlaylistStore.setState({ playlists: [{ ...summary('p1', 'Theirs'), readonly: true }] });
    mockApi(() => Response.json({}));
    await store().append('p1', ['a']);
    await store().rename('p1', 'Mine');
    await store().remove('p1');
    expect(requests).toEqual([]);
  });

  it('removes tracks optimistically and rolls back on failure', async () => {
    usePlaylistStore.setState({
      playlists: [summary('p1', 'Mix', 3)],
      tracks: { p1: ['a', 'b', 'c'] },
    });
    let resolve: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((r) => (resolve = r))),
    );
    const pending = store().removeTracks('p1', [1]);
    expect(store().tracks.p1).toEqual(['a', 'c']);
    resolve?.(Response.json({ error: 'boom' }, { status: 502 }));
    await pending;
    expect(store().tracks.p1).toEqual(['a', 'b', 'c']);
    expect(useNotificationStore.getState().current).toMatchObject({
      severity: 'error',
      message: 'Could not remove the tracks: boom',
    });
  });

  it('renames, skipping empty or unchanged names', async () => {
    usePlaylistStore.setState({ playlists: [summary('p1', 'Mix')], renamingId: 'p1' });
    mockApi(() => Response.json({ ...summary('p1', 'Road trip'), trackIds: [] }));
    await store().rename('p1', '  ');
    await store().rename('p1', 'Mix');
    expect(requests).toEqual([]);
    await store().rename('p1', ' Road trip ');
    expect(requests[0]?.body).toEqual({ name: 'Road trip' });
    expect(store()).toMatchObject({ renamingId: null, playlists: [{ name: 'Road trip' }] });
  });

  it('deletes and leaves the playlist view', async () => {
    usePlaylistStore.setState({
      playlists: [summary('p1', 'Mix'), summary('p2', 'Other')],
      tracks: { p1: [] },
    });
    useViewStore.setState({ activeView: 'playlist:p1' });
    mockApi(() => new Response(null, { status: 204 }));
    await store().remove('p1');
    expect(store().playlists.map((p) => p.id)).toEqual(['p2']);
    expect(store().tracks).toEqual({});
    expect(useViewStore.getState().activeView).toBe('filter');
  });

  it('reorders at once and saves the order', async () => {
    usePlaylistStore.setState({
      playlists: [summary('a', 'A'), summary('b', 'B'), summary('c', 'C')],
    });
    mockApi(() => new Response(null, { status: 204 }));
    await store().move(2, 0);
    expect(store().playlists.map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(requests[0]).toEqual({
      url: '/api/playlists/order',
      method: 'PUT',
      body: { ids: ['c', 'a', 'b'] },
    });
  });
});
