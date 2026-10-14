import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { sampleSnapshot, stubLayout, stubMedia } from '../helpers/catalog';
import { dragAndDrop } from '../helpers/dnd';
import { FakeApi } from '../helpers/fake-api';
import { decodeSnapshot, type Catalog } from '@/client/catalog/decode';
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
let api: FakeApi;

beforeEach(async () => {
  localStorage.clear();
  const snapshot = await sampleSnapshot();
  catalog = decodeSnapshot(snapshot);
  const ids = catalog.tracks.map((t) => t.id);
  api = new FakeApi({
    snapshot,
    playlists: [
      { id: 'p1', name: 'Road trip', trackIds: [ids[0]!, ids[1]!] },
      { id: 'p2', name: 'Shared', readonly: true, trackIds: [ids[2]!] },
    ],
  });
  restore = [stubLayout(), stubMedia(), api.install()];
  useCatalogStore.setState({ status: 'ready', catalog, error: null });
  useFilterStore.setState({ filters: EMPTY_FILTERS, excluded: [] });
  useViewStore.setState({ activeView: 'filter', sorting: [], columnSizing: {} });
  useSelectionStore.getState().clear();
  usePlayerStore.setState(initialPlayer, true);
  usePlaylistStore.setState(initialPlaylists, true);
});

afterEach(() => {
  for (const undo of restore) undo();
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
const filterOption = (box: string, name: string) =>
  within(screen.getByRole('listbox', { name: box })).getByRole('option', {
    name: new RegExp(`^${name}`),
  });
const playlistButton = (name: RegExp) =>
  within(screen.getByRole('list', { name: 'Playlists' })).getByRole('button', { name });

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
    const { accepted, transfer } = dragAndDrop(
      rows()[3]!,
      screen.getByRole('region', { name: 'New playlist drop zone' }),
    );
    expect(accepted).toBe(true);
    expect(transfer.data['text/plain']).toBe('3 tracks');

    await waitFor(() => expect(api.sent('POST').length > 0).toBe(true));
    const post = api.sent('POST')[0]!;
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
    expect(api.requests.at(-1)).toMatchObject({
      url: '/api/playlists/p3',
      method: 'PATCH',
      body: { name: 'Rock' },
    });
  });

  it('drags an unselected row alone onto a playlist (appended)', async () => {
    await renderApp();
    fireEvent.click(rows()[0]!);
    dragAndDrop(rows()[6]!, playlistButton(/Road trip/));
    await waitFor(() => expect(playlistButton(/Road trip\s*3/)).toBeInTheDocument());
    const patch = api.sent('PATCH')[0]!;
    expect((patch.body as { add: string[] }).add.map(titleById)).toEqual(['So What (Live)']);
    expect(useSelectionStore.getState().selection.ids.size).toBe(1);
  });

  it('refuses drops on read-only playlists', async () => {
    await renderApp();
    const { accepted } = dragAndDrop(rows()[0]!, playlistButton(/Shared/));
    expect(accepted).toBe(false);
    expect(api.sent('PATCH').length > 0).toBe(false);
  });

  it('appends dropped tracks to the queue', async () => {
    await renderApp();
    act(() => usePlayerStore.getState().playQueue([catalog.tracks[0]!.id], 0));
    dragAndDrop(rows()[5]!, screen.getByRole('button', { name: /Currently playing/ }));
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
    expect(api.sent('PATCH')[0]?.body).toEqual({ remove: [0] });

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
    expect(api.sent('DELETE', '/api/playlists/p1').length > 0).toBe(true);
  });

  it('drags an artist from the filters: a playlist named after it, with all its tracks', async () => {
    await renderApp();
    const { accepted, transfer } = dragAndDrop(
      filterOption('Artist', 'Aerosmith'),
      screen.getByRole('region', { name: 'New playlist drop zone' }),
    );
    expect(accepted).toBe(true);
    expect(transfer.data['text/plain']).toBe('Aerosmith · 4 tracks');
    await waitFor(() => expect(api.sent('POST').length > 0).toBe(true));
    const body = api.sent('POST')[0]!.body as {
      name: string;
      trackIds: string[];
    };
    expect(body.name).toBe('Aerosmith');
    expect(body.trackIds.map(titleById)).toEqual([
      'Walk This Way',
      'Sweet Emotion',
      'Back in the Saddle (Live)',
      'Love in an Elevator',
    ]);
    // Dragging does not change the filters.
    expect(useFilterStore.getState().filters).toEqual(EMPTY_FILTERS);
  });

  it('drags every selected value of a box, and makes the name unique', async () => {
    api.playlists.push({ id: 'p9', name: 'ABBA, Miles Davis', trackIds: [] });
    await renderApp();
    fireEvent.click(filterOption('Artist', 'ABBA'));
    fireEvent.click(filterOption('Artist', 'Miles Davis'), { ctrlKey: true });
    dragAndDrop(
      filterOption('Artist', 'ABBA'),
      screen.getByRole('region', { name: 'New playlist drop zone' }),
    );
    await waitFor(() => expect(api.sent('POST').length > 0).toBe(true));
    const body = api.sent('POST')[0]!.body as {
      name: string;
      trackIds: string[];
    };
    expect(body.name).toBe('ABBA, Miles Davis 2');
    expect(body.trackIds).toHaveLength(4);
  });

  it('drops a filter value on an existing playlist (appended)', async () => {
    await renderApp();
    dragAndDrop(filterOption('Album', 'Pump'), playlistButton(/Road trip/));
    await waitFor(() => expect(playlistButton(/Road trip\s*3/)).toBeInTheDocument());
    const patch = api.sent('PATCH')[0]!;
    expect((patch.body as { add: string[] }).add.map(titleById)).toEqual(['Love in an Elevator']);
  });

  it('does not drag "All"', async () => {
    await renderApp();
    expect(filterOption('Artist', 'All')).toHaveAttribute('draggable', 'false');
    expect(filterOption('Artist', 'ABBA')).toHaveAttribute('draggable', 'true');
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
    api.playlists[0]!.trackIds = [];
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
    expect(api.sent('POST')[0]?.body).toEqual({
      name: 'New playlist',
      trackIds: [],
    });
  });
});
