import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { sampleCatalog, stubLayout, stubMedia } from '../helpers/catalog';
import { EMPTY_FILTERS } from '@/client/catalog/facets';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { selectCurrentTrackId, usePlayerStore } from '@/client/stores/playerStore';
import { useSelectionStore } from '@/client/stores/selectionStore';
import { useViewStore } from '@/client/stores/viewStore';
import AppShell from '@/components/AppShell/AppShell';
import theme from '@/theme/theme';

const initialPlayer = usePlayerStore.getState();
let restore: (() => void)[] = [];

beforeEach(async () => {
  restore = [stubLayout(), stubMedia()];
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('/api/queue')
        ? Response.json({ ids: [], index: -1, position: 0 })
        : new Response(null, { status: 304 }),
    ),
  );
  useCatalogStore.setState({ status: 'ready', catalog: await sampleCatalog(), error: null });
  useFilterStore.setState({ filters: EMPTY_FILTERS, excluded: [] });
  useViewStore.setState({ activeView: 'filter', sorting: [], columnSizing: {} });
  useSelectionStore.getState().clear();
  usePlayerStore.setState(initialPlayer, true);
});

afterEach(() => {
  for (const undo of restore) undo();
  vi.unstubAllGlobals();
});

function renderApp() {
  return render(
    <ThemeProvider theme={theme}>
      <AppShell />
    </ThemeProvider>,
  );
}

const grid = () => screen.getByRole('grid', { name: 'Tracks' });
const rows = () => within(grid()).getAllByRole('row').slice(1);
const titleOf = (row: HTMLElement) => row.querySelectorAll('td')[1]?.textContent;
const bar = () => screen.getByRole('banner');
const titleById = (id: string | null | undefined) =>
  useCatalogStore.getState().catalog?.tracks.find((t) => t.id === id)?.title;

describe('player', () => {
  it('double-click plays the listed tracks from that row', () => {
    renderApp();
    fireEvent.click(
      within(screen.getByRole('listbox', { name: 'Genre' })).getByRole('option', { name: /^Rock/ }),
    );
    fireEvent.doubleClick(rows()[1]!);

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(4);
    expect(state.index).toBe(1);
    expect(state.status).toBe('loading');
    expect(within(bar()).getByText('Sweet Emotion')).toBeInTheDocument();
    expect(within(bar()).getByText('Aerosmith — Toys in the Attic')).toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(titleOf(grid().querySelector('[aria-current=true]') as HTMLElement)).toBe(
      'Sweet Emotion',
    );
  });

  it('plays the selected track with Enter, follows the sort order', () => {
    renderApp();
    const header = within(grid()).getByRole('columnheader', { name: 'Title' });
    fireEvent.click(within(header).getByRole('button'));
    fireEvent.click(rows()[2]!);
    fireEvent.keyDown(grid(), { key: 'Enter' });
    const state = usePlayerStore.getState();
    expect(state.index).toBe(2);
    expect(titleById(selectCurrentTrackId(state))).toBe('Dancing Queen');
    expect(titleById(state.queue[0])).toBe('Back in the Saddle (Live)');
  });

  it('drives the transport buttons', () => {
    renderApp();
    fireEvent.doubleClick(rows()[0]!);
    act(() => usePlayerStore.getState().reportStatus('playing'));
    fireEvent.click(within(bar()).getByRole('button', { name: 'Next' }));
    expect(usePlayerStore.getState().index).toBe(1);
    fireEvent.click(within(bar()).getByRole('button', { name: 'Pause' }));
    expect(usePlayerStore.getState().status).toBe('paused');
    fireEvent.click(within(bar()).getByRole('button', { name: 'Stop' }));
    expect(usePlayerStore.getState()).toMatchObject({ status: 'stopped', position: 0 });
    fireEvent.click(within(bar()).getByRole('button', { name: 'Previous' }));
    expect(usePlayerStore.getState().index).toBe(0);
  });

  it('shows the queue, and Delete removes tracks from it', () => {
    renderApp();
    fireEvent.doubleClick(rows()[0]!);
    fireEvent.click(screen.getByRole('button', { name: /Currently playing/ }));
    expect(rows()).toHaveLength(10);
    // Sorting does not apply to the queue.
    expect(
      within(within(grid()).getByRole('columnheader', { name: 'Title' })).queryByRole('button'),
    ).toBeTruthy();

    fireEvent.click(rows()[3]!);
    fireEvent.click(rows()[4]!, { shiftKey: true });
    fireEvent.keyDown(grid(), { key: 'Delete' });
    expect(usePlayerStore.getState().queue).toHaveLength(8);
    expect(rows()).toHaveLength(8);
    expect(useFilterStore.getState().excluded).toEqual([]);
  });

  it('resumes on the next click when the browser blocked playback', () => {
    renderApp();
    fireEvent.doubleClick(rows()[0]!);
    act(() => usePlayerStore.getState().reportBlocked());
    expect(within(bar()).getByText(/click anywhere or press a key to resume/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('main'));
    expect(usePlayerStore.getState()).toMatchObject({ status: 'loading', resumePending: false });
  });

  it('a click on Stop cancels the pending resume', () => {
    renderApp();
    fireEvent.doubleClick(rows()[0]!);
    act(() => usePlayerStore.getState().reportBlocked());
    fireEvent.click(within(bar()).getByRole('button', { name: 'Stop' }));
    expect(usePlayerStore.getState()).toMatchObject({ status: 'stopped', resumePending: false });
  });

  it('picks a playback mode from the player bar', () => {
    renderApp();
    fireEvent.click(within(bar()).getByRole('button', { name: 'Playback mode: In order' }));
    const menu = screen.getByRole('menu', { name: 'Playback mode' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.querySelector('.MuiListItemText-primary')?.textContent),
    ).toEqual([
      'In order',
      'Shuffle',
      'Random',
      'Shuffle by album',
      'Random by album',
      'Shuffle by artist',
      'Random by artist',
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^Shuffle by album/ }));
    expect(usePlayerStore.getState().mode).toBe('albumShuffle');
    expect(
      within(bar()).getByRole('button', { name: 'Playback mode: Shuffle by album' }),
    ).toBeInTheDocument();

    // The double-clicked track plays first, its album continues.
    fireEvent.doubleClick(rows()[2]!);
    const queue = usePlayerStore.getState().queue.map(titleById);
    expect(queue.slice(0, 2)).toEqual(['Walk This Way', 'Sweet Emotion']);
    expect(queue).toHaveLength(10);
  });

  it('space toggles playback outside inputs', () => {
    renderApp();
    fireEvent.doubleClick(rows()[0]!);
    act(() => usePlayerStore.getState().reportStatus('playing'));
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(usePlayerStore.getState().status).toBe('paused');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search Genre' }), { key: ' ' });
    expect(usePlayerStore.getState().status).toBe('paused');
  });
});
