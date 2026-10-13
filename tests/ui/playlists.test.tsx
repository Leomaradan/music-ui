import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { sampleCatalog, stubLayout, stubMedia } from '../helpers/catalog';
import type { Catalog } from '@/client/catalog/decode';
import { EMPTY_FILTERS } from '@/client/catalog/facets';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { usePlayerStore } from '@/client/stores/playerStore';
import { usePlaylistStore } from '@/client/stores/playlistStore';
import { useSelectionStore } from '@/client/stores/selectionStore';
import { useViewStore } from '@/client/stores/viewStore';
import AppShell from '@/components/AppShell/AppShell';
import theme from '@/theme/theme';

const initialPlayer = usePlayerStore.getState();
const initialPlaylists = usePlaylistStore.getState();
let catalog: Catalog;
let restore: (() => void)[] = [];
let requests: { url: string; method: string; body: unknown }[];
let server: {
  playlists: { id: string; name: string; songCount: number; readonly: boolean }[];
  tracks: Record<string, string[]>;
};

/** A DataTransfer stand-in: jsdom has none. */
function dataTransfer() {
  const data: Record<string, string> = {};
  return {
    data,
    types: [] as string[],
    effectAllowed: 'all',
    dropEffect: 'none',
    setData(type: string, value: string) {
      data[type] = value;
      if (!this.types.includes(type)) this.types.push(type);
    },
    getData: (type: string) => data[type] ?? '',
    setDragImage() {},
  };
}

const detail = (id: string) => {
  const p = server.playlists.find((x) => x.id === id)!;
  return {
    ...p,
    duration: 0,
    coverArt: null,
    songCount: server.tracks[id]!.length,
    trackIds: server.tracks[id],
  };
};

beforeEach(async () => {
  restore = [stubLayout(), stubMedia()];
  localStorage.clear();
  catalog = await sampleCatalog();
  const ids = catalog.tracks.map((t) => t.id);
  server = {
    playlists: [
      { id: 'p1', name: 'Road trip', songCount: 2, readonly: false },
      { id: 'p2', name: 'Shared', songCount: 1, readonly: true },
    ],
    tracks: { p1: [ids[0]!, ids[1]!], p2: [ids[2]!] },
  };
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });
      if (url === '/api/playlists' && method === 'GET') {
        return Response.json({
          playlists: server.playlists.map((p) => ({ ...p, duration: 0, coverArt: null })),
        });
      }
      if (url === '/api/playlists' && method === 'POST') {
        server.playlists.push({
          id: 'p3',
          name: body.name,
          songCount: body.trackIds.length,
          readonly: false,
        });
        server.tracks.p3 = body.trackIds;
        return Response.json({ ...detail('p3'), trackIds: undefined }, { status: 201 });
      }
      const match = /^\/api\/playlists\/(p\d)$/.exec(url);
      if (match) {
        const id = match[1]!;
        if (method === 'PATCH') {
          const removed = new Set<number>(body.remove ?? []);
          server.tracks[id] = [
            ...server.tracks[id]!.filter((_, i) => !removed.has(i)),
            ...(body.add ?? []),
          ];
          if (body.name) server.playlists.find((p) => p.id === id)!.name = body.name;
        }
        if (method === 'DELETE') {
          server.playlists = server.playlists.filter((p) => p.id !== id);
          return new Response(null, { status: 204 });
        }
        return Response.json(detail(id));
      }
      if (url.startsWith('/api/queue')) return Response.json({ ids: [], index: -1, position: 0 });
      return new Response(null, { status: url === '/api/playlists/order' ? 204 : 304 });
    }),
  );
  useCatalogStore.setState({ status: 'ready', catalog, error: null });
  useFilterStore.setState({ filters: EMPTY_FILTERS, excluded: [] });
  useViewStore.setState({ activeView: 'filter', sorting: [], columnSizing: {} });
  useSelectionStore.getState().clear();
  usePlayerStore.setState(initialPlayer, true);
  usePlaylistStore.setState(initialPlaylists, true);
});

afterEach(() => {
  for (const undo of restore) undo();
  vi.unstubAllGlobals();
});

async function renderApp() {
  render(
    <ThemeProvider theme={theme}>
      <AppShell />
    </ThemeProvider>,
  );
  await screen.findByRole('button', { name: /Road trip/ });
}

const grid = () => screen.getByRole('grid', { name: 'Tracks' });
const rows = () => within(grid()).getAllByRole('row').slice(1);
const titleOf = (row: HTMLElement) => row.querySelectorAll('td')[1]?.textContent;
const titleById = (id: string) => catalog.tracks.find((t) => t.id === id)?.title;
const playlistButton = (name: RegExp) =>
  within(screen.getByRole('list', { name: 'Playlists' })).getByRole('button', { name });

/** Drags `row` and drops it on `target`; returns whether the target accepted it. */
function dragTo(row: HTMLElement, target: HTMLElement) {
  const transfer = dataTransfer();
  fireEvent.dragStart(row, { dataTransfer: transfer });
  const accepted = !fireEvent.dragOver(target, { dataTransfer: transfer });
  if (accepted) fireEvent.drop(target, { dataTransfer: transfer });
  fireEvent.dragEnd(row, { dataTransfer: transfer });
  return { accepted, transfer };
}

describe('playlists', () => {
  it('lists the playlists and opens one in the table', async () => {
    await renderApp();
    expect(
      within(screen.getByRole('list', { name: 'Playlists' }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Road trip2', 'Shared1']);
    fireEvent.click(playlistButton(/Road trip/));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows().map(titleOf)).toEqual(['Dancing Queen', 'Knowing Me, Knowing You']);
  });

  it('creates a playlist from the dragged selection, then renames it', async () => {
    await renderApp();
    fireEvent.click(rows()[2]!);
    fireEvent.click(rows()[4]!, { shiftKey: true });
    const { accepted, transfer } = dragTo(
      rows()[3]!,
      screen.getByRole('region', { name: 'New playlist drop zone' }),
    );
    expect(accepted).toBe(true);
    expect(transfer.data['text/plain']).toBe('3 tracks');

    await waitFor(() => expect(requests.some((r) => r.method === 'POST')).toBe(true));
    const post = requests.find((r) => r.method === 'POST')!;
    expect((post.body as { name: string }).name).toBe('New playlist');
    expect((post.body as { trackIds: string[] }).trackIds.map(titleById)).toEqual([
      'Walk This Way',
      'Sweet Emotion',
      'Back in the Saddle (Live)',
    ]);

    const field = await screen.findByRole('textbox', { name: 'Playlist name' });
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: 'Rock' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(playlistButton(/^Rock\s*3/)).toBeInTheDocument());
    expect(requests.at(-1)).toMatchObject({
      url: '/api/playlists/p3',
      method: 'PATCH',
      body: { name: 'Rock' },
    });
  });

  it('drags an unselected row alone onto a playlist (appended)', async () => {
    await renderApp();
    fireEvent.click(rows()[0]!);
    dragTo(rows()[6]!, playlistButton(/Road trip/));
    await waitFor(() => expect(playlistButton(/Road trip\s*3/)).toBeInTheDocument());
    const patch = requests.find((r) => r.method === 'PATCH')!;
    expect((patch.body as { add: string[] }).add.map(titleById)).toEqual(['So What (Live)']);
    expect(useSelectionStore.getState().selection.ids.size).toBe(1);
  });

  it('refuses drops on read-only playlists', async () => {
    await renderApp();
    const { accepted } = dragTo(rows()[0]!, playlistButton(/Shared/));
    expect(accepted).toBe(false);
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false);
  });

  it('appends dropped tracks to the queue', async () => {
    await renderApp();
    act(() => usePlayerStore.getState().playQueue([catalog.tracks[0]!.id], 0));
    dragTo(rows()[5]!, screen.getByRole('button', { name: /Currently playing/ }));
    expect(usePlayerStore.getState().queue.map(titleById)).toEqual([
      'Dancing Queen',
      'Love in an Elevator',
    ]);
  });

  it('removes tracks from the open playlist and plays it', async () => {
    await renderApp();
    fireEvent.click(playlistButton(/Road trip/));
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(rows()[0]!);
    fireEvent.keyDown(grid(), { key: 'Delete' });
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ remove: [0] });

    fireEvent.doubleClick(rows()[0]!);
    expect(usePlayerStore.getState().queue.map(titleById)).toEqual(['Knowing Me, Knowing You']);
  });

  it('deletes a playlist after confirmation', async () => {
    await renderApp();
    fireEvent.contextMenu(playlistButton(/Road trip/));
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete “Road trip”?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Playlists' })).queryByRole('button', {
          name: /Road trip/,
        }),
      ).toBeNull(),
    );
    expect(requests.some((r) => r.method === 'DELETE' && r.url === '/api/playlists/p1')).toBe(true);
  });

  it('shows the drop zone above the playlists', async () => {
    await renderApp();
    const zone = screen.getByRole('region', { name: 'New playlist drop zone' });
    const list = screen.getByRole('list', { name: 'Playlists' });
    expect(zone.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('double-click plays a playlist (rename is in the context menu)', async () => {
    await renderApp();
    fireEvent.doubleClick(playlistButton(/Road trip/));
    await waitFor(() =>
      expect(usePlayerStore.getState().queue.map(titleById)).toEqual([
        'Dancing Queen',
        'Knowing Me, Knowing You',
      ]),
    );
    expect(usePlayerStore.getState()).toMatchObject({ index: 0, status: 'loading' });
    expect(screen.queryByRole('textbox', { name: 'Playlist name' })).toBeNull();

    fireEvent.contextMenu(playlistButton(/Road trip/));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(await screen.findByRole('textbox', { name: 'Playlist name' })).toHaveValue('Road trip');
  });

  it('tells when a double-clicked playlist is empty', async () => {
    server.tracks.p1 = [];
    await renderApp();
    fireEvent.doubleClick(playlistButton(/Road trip/));
    expect(await screen.findByText('"Road trip" is empty')).toBeInTheDocument();
    expect(usePlayerStore.getState().queue).toEqual([]);
  });

  it('creates an empty playlist with the + button', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'New playlist' }));
    expect(await screen.findByRole('textbox', { name: 'Playlist name' })).toHaveValue(
      'New playlist',
    );
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      name: 'New playlist',
      trackIds: [],
    });
  });
});
