import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { sampleCatalog, stubLayout, stubMedia } from '../helpers/catalog';
import { EMPTY_FILTERS } from '@/client/catalog/facets';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { usePlayerStore } from '@/client/stores/playerStore';
import { useUiStore } from '@/client/stores/uiStore';
import { useViewStore } from '@/client/stores/viewStore';
import AppShell from '@/components/AppShell/AppShell';
import { documentTitle } from '@/components/PlayerHost/PlayerHost';
import theme from '@/theme/theme';

const initialPlayer = usePlayerStore.getState();
let restore: (() => void)[] = [];
let syncState: 'idle' | 'syncing' = 'idle';
let catalogRequests = 0;

const status = () => ({
  state: syncState,
  progress:
    syncState === 'syncing'
      ? { phase: 'tracks', folder: 'Main', foldersDone: 0, foldersTotal: 2, tracks: 120 }
      : null,
  lastSync: { at: new Date(Date.now() - 5 * 60_000).toISOString(), version: 'v1' },
  lastRun: null,
  lastError: null,
  trackCount: 10,
});

beforeEach(async () => {
  restore = [stubLayout(), stubMedia()];
  localStorage.clear();
  syncState = 'idle';
  catalogRequests = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/health') {
        return Response.json({
          status: 'ok',
          subsonic: { reachable: true, server: 'navidrome 0.64.2' },
        });
      }
      if (url === '/api/catalog/status') return Response.json(status());
      if (url === '/api/catalog/rescan' && init?.method === 'POST') {
        syncState = 'syncing';
        return Response.json(status(), { status: 202 });
      }
      if (url === '/api/catalog') {
        catalogRequests++;
        return new Response(null, { status: 304 });
      }
      if (url === '/api/playlists') return Response.json({ playlists: [] });
      if (url.startsWith('/api/queue')) return Response.json({ ids: [], index: -1, position: 0 });
      return new Response(null, { status: 404 });
    }),
  );
  useCatalogStore.setState({ status: 'ready', catalog: await sampleCatalog(), error: null });
  useFilterStore.setState({ filters: EMPTY_FILTERS, excluded: [] });
  useViewStore.setState({
    activeView: 'filter',
    sorting: [{ id: 'title', desc: true }],
    columnSizing: { title: 400 },
  });
  usePlayerStore.setState(initialPlayer, true);
  useUiStore.setState({ settings: null });
});

afterEach(() => {
  for (const undo of restore) undo();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderApp() {
  render(
    <ThemeProvider theme={theme}>
      <AppShell />
    </ThemeProvider>,
  );
}

describe('settings', () => {
  it('opens from the player bar and shows the library status', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(await within(dialog).findByText('Connected · navidrome 0.64.2')).toBeInTheDocument();
    expect(await within(dialog).findByText('10 tracks · synced 5 minutes ago')).toBeInTheDocument();
  });

  it('rescans, shows the progress, then reloads the catalog', async () => {
    renderApp();
    act(() => useUiStore.getState().openSettings('library'));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Rescan library' }));
    expect(await within(dialog).findByRole('button', { name: 'Syncing…' })).toBeDisabled();
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Syncing “Main” (0/2 folders, 120 tracks)…',
    );

    const before = catalogRequests;
    syncState = 'idle';
    await waitFor(
      () => expect(within(dialog).getByRole('button', { name: 'Rescan library' })).toBeEnabled(),
      {
        timeout: 3000,
      },
    );
    await waitFor(() => expect(catalogRequests).toBe(before + 1));
    expect(await screen.findByText('Library synced: 10 tracks')).toBeInTheDocument();
  });

  it('switches the theme and resets the table layout', async () => {
    renderApp();
    act(() => useUiStore.getState().openSettings('appearance'));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dark' }));
    await waitFor(() => expect(localStorage.getItem('mui-mode')).toBe('dark'));
    expect(within(dialog).getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset sort and column widths' }));
    expect(useViewStore.getState()).toMatchObject({ sorting: [], columnSizing: {} });
  });

  it('opens the shortcuts with "?"', () => {
    renderApp();
    fireEvent.keyDown(document.body, { key: '?' });
    const table = screen.getByRole('table', { name: 'Keyboard shortcuts' });
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(5);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Shortcuts');
  });
});

describe('documentTitle', () => {
  it('shows the current track', () => {
    expect(documentTitle(undefined, false)).toBe('Music UI');
    expect(documentTitle({ title: 'Dancing Queen', artist: 'ABBA' }, true)).toBe(
      '▶ Dancing Queen — ABBA · Music UI',
    );
    expect(documentTitle({ title: 'Untitled', artist: '' }, false)).toBe('Untitled · Music UI');
  });
});
