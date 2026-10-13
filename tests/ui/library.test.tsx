import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { sampleCatalog, stubLayout } from '../helpers/catalog';
import { EMPTY_FILTERS } from '@/client/catalog/facets';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { useSelectionStore } from '@/client/stores/selectionStore';
import { useViewStore } from '@/client/stores/viewStore';
import AppShell from '@/components/AppShell/AppShell';
import theme from '@/theme/theme';

let restoreLayout: () => void;

beforeEach(async () => {
  restoreLayout = stubLayout();
  localStorage.clear();
  // The server answers "unchanged" to the loader's revalidation.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 304 })),
  );
  useCatalogStore.setState({ status: 'ready', catalog: await sampleCatalog(), error: null });
  useFilterStore.setState({ filters: EMPTY_FILTERS, excluded: [] });
  useViewStore.setState({ activeView: 'filter', sorting: [], columnSizing: {} });
  useSelectionStore.getState().clear();
});

afterEach(() => {
  restoreLayout();
  vi.unstubAllGlobals();
});

function renderApp() {
  return render(
    <ThemeProvider theme={theme}>
      <AppShell />
    </ThemeProvider>,
  );
}

const box = (name: string) => screen.getByRole('listbox', { name });
const optionNames = (name: string) =>
  within(box(name))
    .getAllByRole('option')
    .map((option) => option.textContent);
const pick = (
  boxName: string,
  label: string,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {},
) =>
  fireEvent.click(
    within(box(boxName)).getByRole('option', { name: new RegExp(`^${label}`) }),
    modifiers,
  );
const selectedIn = (boxName: string) =>
  within(box(boxName))
    .getAllByRole('option', { selected: true })
    .map((option) => option.textContent);
const grid = () => screen.getByRole('grid', { name: 'Tracks' });
const titles = () =>
  within(grid())
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelectorAll('td')[1]?.textContent);
const summary = () => screen.getByRole('status', { name: 'Track summary' }).textContent;

describe('library view', () => {
  it('lists every track and every filter value', () => {
    renderApp();
    expect(titles()).toHaveLength(10);
    expect(summary()).toBe('10 tracks · 1 min');
    expect(optionNames('Music Folder')).toEqual(['All10', 'Main7', 'Live3']);
    expect(optionNames('Artist')).toEqual([
      'All10',
      'ABBA2',
      'Aerosmith4',
      'Miles Davis2',
      'Various Artists2',
    ]);
  });

  it('cascades the filters and narrows the table', () => {
    renderApp();
    pick('Genre', 'Rock');
    expect(optionNames('Artist')).toEqual(['All4', 'Aerosmith4']);
    pick('Artist', 'Aerosmith');
    expect(titles()).toEqual([
      'Walk This Way',
      'Sweet Emotion',
      'Back in the Saddle (Live)',
      'Love in an Elevator',
    ]);
    pick('Album', 'Pump');
    expect(titles()).toEqual(['Love in an Elevator']);

    // Changing a parent box clears the boxes after it. A plain click replaces the selection.
    pick('Genre', 'Jazz');
    expect(selectedIn('Genre')).toEqual(['Jazz2']);
    expect(selectedIn('Artist')).toEqual(['All2']);
    expect(selectedIn('Album')).toEqual(['All2']);
    expect(titles()).toHaveLength(2);

    // "All" clears a box.
    pick('Genre', 'All');
    expect(titles()).toHaveLength(10);
  });

  it('selects like a list: click replaces, Ctrl/Cmd toggles, Shift selects a range', () => {
    renderApp();
    pick('Genre', 'Dance');
    pick('Genre', 'Pop');
    expect(selectedIn('Genre')).toEqual(['Pop4']);

    pick('Genre', 'Rock', { ctrlKey: true });
    expect(selectedIn('Genre')).toEqual(['Pop4', 'Rock4']);
    pick('Genre', 'Pop', { ctrlKey: true });
    expect(selectedIn('Genre')).toEqual(['Rock4']);

    pick('Genre', 'Dance');
    pick('Genre', 'Pop', { shiftKey: true });
    expect(selectedIn('Genre')).toEqual(['Dance2', 'Jazz2', 'Pop4']);
    expect(useFilterStore.getState().filters.genres).toEqual(['Dance', 'Jazz', 'Pop']);
    expect(titles()).toHaveLength(6);
  });

  it('searches inside a box', () => {
    renderApp();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Artist' }), {
      target: { value: 'mile' },
    });
    expect(optionNames('Artist')).toEqual(['Miles Davis2']);
  });

  it('selects rows and removes them from the results with Delete', () => {
    renderApp();
    const rows = within(grid()).getAllByRole('row').slice(1);
    fireEvent.click(rows[0]!);
    fireEvent.click(rows[2]!, { shiftKey: true });
    fireEvent.click(rows[5]!, { ctrlKey: true });
    expect(summary()).toBe('10 tracks · 1 min · 4 selected');

    fireEvent.keyDown(grid(), { key: 'Delete' });
    expect(titles()).toHaveLength(6);
    expect(titles()).not.toContain('Dancing Queen');
    expect(summary()).toContain('4 removed from results');

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(titles()).toHaveLength(10);
  });

  it('removes tracks from the context menu', () => {
    renderApp();
    const row = within(grid()).getAllByRole('row')[3]!;
    fireEvent.contextMenu(row);
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove from results/ }));
    expect(titles()).toHaveLength(9);
  });

  it('brings removed tracks back when a filter changes', () => {
    renderApp();
    fireEvent.click(within(grid()).getAllByRole('row')[1]!);
    fireEvent.keyDown(grid(), { key: 'Delete' });
    expect(titles()).toHaveLength(9);
    pick('Music Folder', 'Main');
    expect(titles()).toHaveLength(7);
  });

  it('selects all with Ctrl+A and moves with the arrow keys', () => {
    renderApp();
    fireEvent.keyDown(grid(), { key: 'a', ctrlKey: true });
    expect(summary()).toContain('10 selected');
    fireEvent.keyDown(grid(), { key: 'Escape' });
    fireEvent.keyDown(grid(), { key: 'ArrowDown' });
    fireEvent.keyDown(grid(), { key: 'ArrowDown', shiftKey: true });
    expect(summary()).toContain('2 selected');
  });

  it('sorts by a column, descending on the second click', () => {
    renderApp();
    const header = within(grid()).getByRole('columnheader', { name: 'Title' });
    fireEvent.click(within(header).getByRole('button'));
    expect(titles().slice(0, 3)).toEqual([
      'Back in the Saddle (Live)',
      'Beach Night',
      'Dancing Queen',
    ]);
    fireEvent.click(within(header).getByRole('button'));
    expect(titles()[0]).toBe('Walk This Way');
    expect(useViewStore.getState().sorting).toEqual([{ id: 'title', desc: true }]);
  });

  it('shows the (empty) queue view and returns to the results on filter change', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Currently playing' }));
    expect(screen.getByText(/The queue is empty/)).toBeInTheDocument();
    pick('Genre', 'Pop');
    expect(useViewStore.getState().activeView).toBe('filter');
    expect(titles()).toHaveLength(4);
  });

  it('explains when the library is not synced yet', () => {
    useCatalogStore.setState({ status: 'waiting', catalog: null });
    renderApp();
    expect(screen.getByText(/Waiting for the first library sync/)).toBeInTheDocument();
    act(() => {
      useCatalogStore.setState({ status: 'error', error: 'The server answered HTTP 500' });
    });
    expect(
      screen.getByText(/Could not load the library: The server answered HTTP 500/),
    ).toBeInTheDocument();
  });
});
