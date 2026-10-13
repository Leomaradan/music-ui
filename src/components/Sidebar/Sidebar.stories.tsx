import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, screen, waitFor, within } from 'storybook/test';
import Box from '@mui/material/Box';
import { endTrackDrag, startTrackDrag } from '@/client/dnd';
import { usePlayerStore } from '@/client/stores/playerStore';
import { usePlaylistStore } from '@/client/stores/playlistStore';
import { useViewStore } from '@/client/stores/viewStore';
import { createDataTransfer, fireDrag } from '../../../tests/helpers/dnd';
import { fakeApi, titleOf, trackByTitle } from '../../../tests/helpers/stories';
import Sidebar from './Sidebar';

const meta = {
  title: 'Layout/Sidebar',
  component: Sidebar,
  decorators: [
    (Story) => (
      <Box component="nav" sx={{ width: 260, height: 520, display: 'grid' }}>
        <Story />
      </Box>
    ),
  ],
  // The playlists are loaded by CatalogLoader in the app.
  beforeEach: async () => {
    await usePlaylistStore.getState().load();
  },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

const playlists = (canvas: HTMLElement) =>
  within(within(canvas).getByRole('list', { name: 'Playlists' }));
const playlist = (canvas: HTMLElement, name: RegExp) =>
  playlists(canvas).getByRole('button', { name });
const dropZone = (canvas: HTMLElement) =>
  within(canvas).getByRole('region', { name: 'New playlist drop zone' });

/**
 * Drops tracks on `target` the way the table and the filter boxes start their drags.
 * Returns whether the target accepted them.
 */
function dropTracks(target: HTMLElement, titles: string[], name: string | null = null) {
  const transfer = createDataTransfer();
  startTrackDrag(
    transfer,
    titles.map((t) => trackByTitle(t).id),
    name,
  );
  fireDrag(target, 'dragenter', transfer);
  const accepted = !fireDrag(target, 'dragover', transfer);
  fireDrag(target, accepted ? 'drop' : 'dragleave', transfer);
  endTrackDrag();
  return accepted;
}

/** "Currently playing" and "Filter results" first, then the drop zone, then the playlists. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        playlists(canvasElement)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Road trip2', 'Shared1']),
    );
    const order = [
      canvas.getByRole('button', { name: 'Currently playing' }),
      canvas.getByRole('button', { name: 'Filter results' }),
      dropZone(canvasElement),
      canvas.getByRole('list', { name: 'Playlists' }),
    ];
    for (const [a, b] of order.slice(0, -1).map((el, i) => [el, order[i + 1]!] as const)) {
      expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  },
};

/** A click opens a playlist in the table. */
export const OpenPlaylist: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(
      await playlists(canvasElement).findByRole('button', { name: /Road trip/ }),
    );
    expect(useViewStore.getState().activeView).toBe('playlist:p1');
    await waitFor(() => expect(usePlaylistStore.getState().tracks.p1).toHaveLength(2));
  },
};

/** Double-click plays the playlist (it does not rename it). */
export const DoubleClickPlays: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.dblClick(
      await playlists(canvasElement).findByRole('button', { name: /Road trip/ }),
    );
    await waitFor(() =>
      expect(usePlayerStore.getState().queue.map(titleOf)).toEqual([
        'Dancing Queen',
        'Knowing Me, Knowing You',
      ]),
    );
    expect(within(canvasElement).queryByRole('textbox', { name: 'Playlist name' })).toBeNull();
  },
};

/** Dropping tracks on the zone creates "New playlist" and opens its name for editing. */
export const DropCreatesPlaylist: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await playlists(canvasElement).findByRole('button', { name: /Road trip/ });
    expect(dropTracks(dropZone(canvasElement), ['Walk This Way', 'Sweet Emotion'])).toBe(true);

    const field = await within(canvasElement).findByRole('textbox', { name: 'Playlist name' });
    expect(field).toHaveValue('New playlist');
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.clear(field);
    await userEvent.type(field, 'Rock{Enter}');
    await waitFor(() => expect(playlist(canvasElement, /^Rock\s*2/)).toBeVisible());

    const post = fakeApi().sent('POST', '/api/playlists')[0]!.body as {
      name: string;
      trackIds: string[];
    };
    expect(post.name).toBe('New playlist');
    expect(post.trackIds.map(titleOf)).toEqual(['Walk This Way', 'Sweet Emotion']);
    expect(fakeApi().sent('PATCH').at(-1)?.body).toEqual({ name: 'Rock' });
  },
};

/** A drop named after the dragged filter values gets that name, made unique. */
export const DropNamedFromFilters: Story = {
  parameters: {
    fakeApi: { playlists: [{ id: 'p1', name: 'Aerosmith', trackIds: [] }] },
  },
  play: async ({ canvasElement }) => {
    await playlists(canvasElement).findByRole('button', { name: /^Aerosmith/ });
    dropTracks(dropZone(canvasElement), ['Walk This Way', 'Love in an Elevator'], 'Aerosmith');
    await waitFor(() => expect(fakeApi().sent('POST')).toHaveLength(1));
    expect(fakeApi().sent('POST')[0]!.body).toMatchObject({ name: 'Aerosmith 2' });
  },
};

/** Dropping on a playlist appends the tracks to it. */
export const DropAppends: Story = {
  play: async ({ canvasElement }) => {
    const roadTrip = await playlists(canvasElement).findByRole('button', { name: /Road trip/ });
    expect(dropTracks(roadTrip, ['So What (Live)'])).toBe(true);
    await waitFor(() => expect(playlist(canvasElement, /Road trip\s*3/)).toBeVisible());
    expect(fakeApi().sent('PATCH', '/api/playlists/p1')[0]?.body).toEqual({
      add: [trackByTitle('So What (Live)').id],
    });
  },
};

/** Read-only playlists (not owned by the account) refuse drops. */
export const ReadOnlyRefusesDrop: Story = {
  play: async ({ canvasElement }) => {
    const shared = await playlists(canvasElement).findByRole('button', { name: /Shared/ });
    expect(dropTracks(shared, ['So What (Live)'])).toBe(false);
    expect(fakeApi().sent('PATCH')).toHaveLength(0);
  },
};

/** Dropping on "Currently playing" adds the tracks to the queue. */
export const DropEnqueues: Story = {
  beforeEach: () => {
    usePlayerStore.getState().playQueue([trackByTitle('Dancing Queen').id], 0);
  },
  play: async ({ canvasElement }) => {
    const queue = within(canvasElement).getByRole('button', { name: /Currently playing/ });
    expect(dropTracks(queue, ['Beach Night'])).toBe(true);
    expect(usePlayerStore.getState().queue.map(titleOf)).toEqual(['Dancing Queen', 'Beach Night']);
  },
};

/** Rename and Delete are in the context menu; Delete asks for confirmation. */
export const ContextMenu: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const roadTrip = await playlists(canvasElement).findByRole('button', { name: /Road trip/ });
    await userEvent.pointer({ keys: '[MouseRight]', target: roadTrip });
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    expect(
      await within(canvasElement).findByRole('textbox', { name: 'Playlist name' }),
    ).toHaveValue('Road trip');
    await userEvent.keyboard('{Escape}');

    await userEvent.pointer({ keys: '[MouseRight]', target: playlist(canvasElement, /Road trip/) });
    await userEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Delete “Road trip”?')).toBeVisible());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(playlists(canvasElement).queryByRole('button', { name: /Road trip/ })).toBeNull(),
    );
    expect(fakeApi().sent('DELETE', '/api/playlists/p1')).toHaveLength(1);
  },
};

/** Playlists are reordered by drag and drop (here with the keyboard: Space, arrows, Space). */
export const Reorder: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const roadTrip = await playlists(canvasElement).findByRole('button', { name: /Road trip/ });
    roadTrip.focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard(' ');
    await waitFor(() =>
      expect(
        playlists(canvasElement)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Shared1', 'Road trip2']),
    );
    expect(fakeApi().sent('PUT', '/api/playlists/order')[0]?.body).toEqual({ ids: ['p2', 'p1'] });
  },
};
