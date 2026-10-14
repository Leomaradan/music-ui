import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, screen, waitFor, within } from 'storybook/test';
import Box from '@mui/material/Box';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useDynamicPlaylistStore } from '@/client/stores/dynamicPlaylistStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { usePlayerStore } from '@/client/stores/playerStore';
import { usePlaylistStore } from '@/client/stores/playlistStore';
import { useViewStore } from '@/client/stores/viewStore';
import { sampleCatalog, titleOf, trackByTitle } from '../../../tests/helpers/stories';
import TrackTable from './TrackTable';

const meta = {
  title: 'Library/TrackTable',
  component: TrackTable,
  decorators: [
    (Story) => (
      <Box sx={{ height: 480, display: 'grid' }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof TrackTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const grid = (canvas: HTMLElement) => within(canvas).getByRole('grid', { name: 'Tracks' });
const rows = (canvas: HTMLElement) => within(grid(canvas)).getAllByRole('row').slice(1);
const titles = (canvas: HTMLElement) =>
  rows(canvas).map((row) => row.querySelectorAll('td')[1]?.textContent);
const selectedTitles = (canvas: HTMLElement) =>
  rows(canvas)
    .filter((row) => row.getAttribute('aria-selected') === 'true')
    .map((row) => row.querySelectorAll('td')[1]?.textContent);

/** "Filter results" with no filter: the whole library, in library order. */
export const FilterResults: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(rows(canvasElement)).toHaveLength(10));
    expect(titles(canvasElement).slice(0, 3)).toEqual([
      'Dancing Queen',
      'Knowing Me, Knowing You',
      'Walk This Way',
    ]);
  },
};

/** The table follows the filters. */
export const Filtered: Story = {
  beforeEach: () => {
    useFilterStore.getState().setLevel('artists', ['Aerosmith']);
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(titles(canvasElement)).toEqual([
        'Walk This Way',
        'Sweet Emotion',
        'Back in the Saddle (Live)',
        'Love in an Elevator',
      ]),
    );
  },
};

/**
 * Click, Shift-click and Ctrl-click select rows; Delete removes them from the results until a
 * filter changes.
 */
export const RemoveFromResults: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await waitFor(() => expect(rows(canvasElement)).toHaveLength(10));
    await userEvent.click(rows(canvasElement)[0]!);
    await userEvent.keyboard('{Shift>}');
    await userEvent.click(rows(canvasElement)[2]!);
    await userEvent.keyboard('{/Shift}{Control>}');
    await userEvent.click(rows(canvasElement)[5]!);
    await userEvent.keyboard('{/Control}');
    expect(selectedTitles(canvasElement)).toEqual([
      'Dancing Queen',
      'Knowing Me, Knowing You',
      'Walk This Way',
      'Love in an Elevator',
    ]);

    await userEvent.keyboard('{Delete}');
    await waitFor(() => expect(rows(canvasElement)).toHaveLength(6));
    expect(titles(canvasElement)).not.toContain('Dancing Queen');

    // Any filter change brings them back.
    useFilterStore.getState().setLevel('folders', [1]);
    await waitFor(() => expect(rows(canvasElement)).toHaveLength(7));
    expect(titles(canvasElement)).toContain('Dancing Queen');
  },
};

/** "Remove from results" in the context menu. */
export const ContextMenu: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await waitFor(() => expect(rows(canvasElement)).toHaveLength(10));
    await userEvent.pointer({ keys: '[MouseRight]', target: rows(canvasElement)[3]! });
    await userEvent.click(await screen.findByRole('menuitem', { name: /Remove from results/ }));
    await waitFor(() => expect(rows(canvasElement)).toHaveLength(9));
    expect(titles(canvasElement)).not.toContain('Sweet Emotion');
  },
};

/** Double-click replaces the queue with the listed tracks and plays the clicked one. */
export const DoubleClickPlays: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await waitFor(() => expect(rows(canvasElement)).toHaveLength(10));
    await userEvent.dblClick(rows(canvasElement)[3]!);
    const { queue, index } = usePlayerStore.getState();
    expect(queue).toEqual(sampleCatalog.tracks.map((t) => t.id));
    expect(titleOf(queue[index]!)).toBe('Sweet Emotion');
  },
};

/** Sorting by a column header, descending on the second click. */
export const Sorting: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const header = within(grid(canvasElement)).getByRole('columnheader', { name: 'Title' });
    await userEvent.click(within(header).getByRole('button'));
    expect(titles(canvasElement).slice(0, 3)).toEqual([
      'Back in the Saddle (Live)',
      'Beach Night',
      'Dancing Queen',
    ]);
    await userEvent.click(within(header).getByRole('button'));
    expect(titles(canvasElement)[0]).toBe('Walk This Way');
    expect(useViewStore.getState().sorting).toEqual([{ id: 'title', desc: true }]);
  },
};

/** "Currently playing" lists the queue and marks the current track. */
export const Queue: Story = {
  beforeEach: () => {
    const ids = ['Sunny Day', 'So What (Live)', 'Walk This Way'].map((t) => trackByTitle(t).id);
    usePlayerStore.getState().playQueue(ids, 1);
    usePlayerStore.setState({ status: 'playing' });
    useViewStore.getState().setActiveView('queue');
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(titles(canvasElement)).toEqual(['Sunny Day', 'So What (Live)', 'Walk This Way']),
    );
    const current = rows(canvasElement)[1]!;
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(within(current).getByLabelText('Playing')).toBeVisible();
  },
};

/** A playlist view lists the playlist's tracks (loaded by the sidebar when opened). */
export const Playlist: Story = {
  beforeEach: async () => {
    await usePlaylistStore.getState().loadTracks('p1');
    useViewStore.getState().setActiveView('playlist:p1');
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(titles(canvasElement)).toEqual(['Dancing Queen', 'Knowing Me, Knowing You']),
    );
  },
};

/** A smart playlist lists the matching tracks: sortable, but nothing can be removed. */
export const SmartPlaylist: Story = {
  beforeEach: async () => {
    await useDynamicPlaylistStore.getState().load();
    useViewStore.getState().setActiveView('dynamic:d1');
  },
  play: async ({ canvasElement, userEvent }) => {
    await waitFor(() =>
      expect(titles(canvasElement)).toEqual([
        'Walk This Way',
        'Sweet Emotion',
        'Back in the Saddle (Live)',
      ]),
    );
    const header = within(grid(canvasElement)).getByRole('columnheader', { name: 'Title' });
    await userEvent.click(within(header).getByRole('button'));
    expect(titles(canvasElement)[0]).toBe('Back in the Saddle (Live)');

    await userEvent.pointer({ keys: '[MouseRight]', target: rows(canvasElement)[0]! });
    expect(await screen.findByRole('menuitem', { name: 'Play' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Remove/ })).toBeNull();
  },
};

/** A smart playlist without matches says so. */
export const SmartPlaylistEmpty: Story = {
  parameters: {
    fakeApi: {
      dynamicPlaylists: [
        {
          id: 'd1',
          name: 'Nothing',
          match: 'all',
          criteria: [{ field: 'genre', op: '==', value: 'Polka' }],
        },
      ],
    },
  },
  beforeEach: async () => {
    await useDynamicPlaylistStore.getState().load();
    useViewStore.getState().setActiveView('dynamic:d1');
  },
  play: async ({ canvasElement }) => {
    expect(
      await within(canvasElement).findByText('No tracks match this smart playlist.'),
    ).toBeVisible();
  },
};

export const EmptyQueue: Story = {
  beforeEach: () => {
    useViewStore.getState().setActiveView('queue');
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/The queue is empty/)).toBeInTheDocument();
  },
};

export const LoadingLibrary: Story = {
  parameters: { catalog: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Loading library')).toBeInTheDocument();
  },
};

export const WaitingForFirstSync: Story = {
  beforeEach: () => {
    useCatalogStore.setState({ status: 'waiting', catalog: null });
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/Waiting for the first library sync/),
    ).toBeInTheDocument();
  },
};
