import { usePlayerStore } from '@/client/stores/playerStore';
import { MAX_SERVER_QUEUE, RESUME_WINDOW_MS, startQueuePersistence } from './persistence';

const initial = usePlayerStore.getState();
let stop: () => void = () => {};
let requests: { method: string; body: unknown }[];

function mockServer(saved: unknown = { ids: [], index: -1, position: 0 }) {
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      requests.push({ method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return method === 'GET' ? Response.json(saved) : new Response(null, { status: 204 });
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  usePlayerStore.setState(initial, true);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const local = () => JSON.parse(localStorage.getItem('music-ui:player') ?? 'null');

describe('queue persistence', () => {
  it('restores the queue saved in this browser first', () => {
    mockServer();
    localStorage.setItem(
      'music-ui:player',
      JSON.stringify({ queue: ['a', 'b'], index: 1, position: 12, volume: 0.5 }),
    );
    stop = startQueuePersistence();
    expect(usePlayerStore.getState()).toMatchObject({
      queue: ['a', 'b'],
      index: 1,
      position: 12,
      volume: 0.5,
      status: 'stopped',
    });
    expect(requests).toEqual([]);
  });

  it('resumes playback when it was playing right before a reload', () => {
    mockServer();
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    localStorage.setItem(
      'music-ui:player',
      JSON.stringify({
        queue: ['a', 'b'],
        index: 1,
        position: 42,
        volume: 1,
        playing: true,
        savedAt: Date.now() - 2_000,
      }),
    );
    stop = startQueuePersistence();
    expect(usePlayerStore.getState()).toMatchObject({ index: 1, position: 42, status: 'loading' });
  });

  it.each([
    ['it was paused', { playing: false, savedAt: 0 }],
    ['the save is old (not a reload)', { playing: true, savedAt: -RESUME_WINDOW_MS - 1 }],
  ])('does not resume when %s', (_label, { playing, savedAt }) => {
    mockServer();
    localStorage.setItem(
      'music-ui:player',
      JSON.stringify({
        queue: ['a'],
        index: 0,
        position: 3,
        volume: 1,
        playing,
        savedAt: Date.now() + savedAt,
      }),
    );
    stop = startQueuePersistence();
    expect(usePlayerStore.getState().status).toBe('stopped');
  });

  it('records whether it was playing when the page goes away', () => {
    mockServer();
    stop = startQueuePersistence();
    usePlayerStore.setState({ queue: ['a'], index: 0, position: 17, status: 'playing' });
    window.dispatchEvent(new Event('pagehide'));
    expect(local()).toMatchObject({ position: 17, playing: true, savedAt: Date.now() });
  });

  it("falls back to the account's queue on the server", async () => {
    mockServer({ ids: ['x', 'y'], index: 1, position: 4 });
    stop = startQueuePersistence();
    await vi.waitFor(() => expect(usePlayerStore.getState().queue).toEqual(['x', 'y']));
    expect(usePlayerStore.getState()).toMatchObject({ index: 1, position: 4 });
  });

  it('saves changes locally at once and to the server debounced', async () => {
    mockServer();
    stop = startQueuePersistence();
    requests.length = 0;
    usePlayerStore.getState().restore({ queue: ['a', 'b', 'c'], index: 0, position: 0 });
    usePlayerStore.setState({ index: 2, position: 7 });
    expect(local()).toMatchObject({ queue: ['a', 'b', 'c'], index: 2 });
    expect(requests).toEqual([]);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(requests).toEqual([
      { method: 'PUT', body: { ids: ['a', 'b', 'c'], index: 2, position: 7 } },
    ]);
  });

  it('sends at most MAX_SERVER_QUEUE tracks around the current one', async () => {
    mockServer();
    stop = startQueuePersistence();
    requests.length = 0;
    const queue = Array.from({ length: MAX_SERVER_QUEUE + 1000 }, (_, i) => `t${i}`);
    usePlayerStore.getState().restore({ queue, index: 3000, position: 1 });
    await vi.advanceTimersByTimeAsync(2_000);
    const body = requests[0]?.body as { ids: string[]; index: number };
    expect(body.ids).toHaveLength(MAX_SERVER_QUEUE);
    expect(body.ids[body.index]).toBe('t3000');
  });

  it('saves the position periodically while playing', async () => {
    mockServer();
    stop = startQueuePersistence();
    usePlayerStore.getState().restore({ queue: ['a'], index: 0, position: 0 });
    await vi.advanceTimersByTimeAsync(2_000);
    requests.length = 0;
    usePlayerStore.setState({ status: 'playing', position: 25 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(local().position).toBe(25);
    expect(requests.at(-1)).toEqual({
      method: 'PUT',
      body: { ids: ['a'], index: 0, position: 25 },
    });
  });
});
