import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, screen, waitFor, within } from 'storybook/test';
import { usePlayerStore } from '@/client/stores/playerStore';
import { useViewStore } from '@/client/stores/viewStore';
import { dragAndDrop } from '../../../tests/helpers/dnd';
import { fakeApi, phoneLayout, titleOf } from '../../../tests/helpers/stories';
import AppShell from './AppShell';

/** The whole app against the fake API: the scenarios that cross components. */
const meta = {
  title: 'App/AppShell',
  component: AppShell,
  // CatalogLoader loads the catalog from the fake API, as in the app.
  parameters: { catalog: 'loading' },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const option = (canvas: HTMLElement, box: string, name: string) =>
  within(within(canvas).getByRole('listbox', { name: box })).getByRole('option', {
    name: new RegExp(`^${name}`),
  });
const rows = (canvas: HTMLElement) =>
  within(within(canvas).getByRole('grid', { name: 'Tracks' }))
    .getAllByRole('row')
    .slice(1);
const titles = (canvas: HTMLElement) =>
  rows(canvas).map((row) => row.querySelectorAll('td')[1]?.textContent);
const playlistButton = (canvas: HTMLElement, name: RegExp) =>
  within(within(canvas).getByRole('list', { name: 'Playlists' })).getByRole('button', { name });

async function loaded(canvas: HTMLElement) {
  await waitFor(() => expect(rows(canvas)).toHaveLength(10), { timeout: 5_000 });
  await within(canvas).findByRole('button', { name: /Road trip/ });
}

/** Loads the library and the playlists; filter, then double-click to play. */
export const FilterAndPlay: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await loaded(canvasElement);
    await userEvent.click(option(canvasElement, 'Genre', 'Rock'));
    await userEvent.click(option(canvasElement, 'Album', 'Toys in the Attic'));
    expect(titles(canvasElement)).toEqual(['Walk This Way', 'Sweet Emotion']);

    await userEvent.dblClick(rows(canvasElement)[1]!);
    await waitFor(() => expect(usePlayerStore.getState().status).toBe('playing'), {
      timeout: 5_000,
    });
    const banner = within(canvasElement).getByRole('banner');
    expect(within(banner).getByText('Sweet Emotion')).toBeVisible();
    expect(usePlayerStore.getState().queue.map(titleOf)).toEqual([
      'Walk This Way',
      'Sweet Emotion',
    ]);
  },
};

/** Dragging an artist from the filters to the drop zone creates a playlist named after it. */
export const DragArtistToNewPlaylist: Story = {
  play: async ({ canvasElement }) => {
    await loaded(canvasElement);
    const { accepted } = dragAndDrop(
      option(canvasElement, 'Artist', 'Aerosmith'),
      within(canvasElement).getByRole('region', { name: 'New playlist drop zone' }),
    );
    expect(accepted).toBe(true);
    await waitFor(() => expect(fakeApi().sent('POST', '/api/playlists')).toHaveLength(1));
    const body = fakeApi().sent('POST', '/api/playlists')[0]!.body as {
      name: string;
      trackIds: string[];
    };
    expect(body.name).toBe('Aerosmith');
    expect(body.trackIds.map(titleOf)).toEqual([
      'Walk This Way',
      'Sweet Emotion',
      'Back in the Saddle (Live)',
      'Love in an Elevator',
    ]);
    expect(
      await within(canvasElement).findByRole('textbox', { name: 'Playlist name' }),
    ).toHaveValue('Aerosmith');
  },
};

/** Selected table rows dropped on a playlist are appended to it. */
export const DragRowsToPlaylist: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await loaded(canvasElement);
    await userEvent.click(rows(canvasElement)[6]!);
    await userEvent.keyboard('{Control>}');
    await userEvent.click(rows(canvasElement)[7]!);
    await userEvent.keyboard('{/Control}');
    const { accepted, transfer } = dragAndDrop(
      rows(canvasElement)[6]!,
      playlistButton(canvasElement, /Road trip/),
    );
    expect(accepted).toBe(true);
    expect(transfer.data['text/plain']).toBe('2 tracks');
    await waitFor(() => expect(playlistButton(canvasElement, /Road trip\s*4/)).toBeVisible());

    await userEvent.click(playlistButton(canvasElement, /Road trip/));
    await waitFor(() =>
      expect(titles(canvasElement)).toEqual([
        'Dancing Queen',
        'Knowing Me, Knowing You',
        'So What (Live)',
        'Stella by Starlight (Live)',
      ]),
    );
  },
};

/**
 * Phone layout: the sidebar opens from the menu button and closes once a list is chosen;
 * the filters open full screen, one box per tab, where taps add values.
 */
export const Phone: Story = {
  beforeEach: phoneLayout,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(rows(canvasElement)).toHaveLength(10), { timeout: 5_000 });
    // No filter boxes and no sidebar on the page itself.
    expect(canvas.queryByRole('listbox', { name: 'Genre' })).toBeNull();
    expect(canvas.queryByRole('navigation')).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Open navigation' }));
    const nav = await screen.findByRole('navigation');
    await userEvent.click(await within(nav).findByRole('button', { name: /Road trip/ }));
    expect(useViewStore.getState().activeView).toBe('playlist:p1');
    await waitFor(() => expect(screen.queryByRole('navigation')).toBeNull());

    await userEvent.click(canvas.getByRole('button', { name: 'Filters' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Filters' }));
    await userEvent.click(dialog.getByRole('tab', { name: 'Genre' }));
    const genre = within(dialog.getByRole('listbox', { name: 'Genre' }));
    await userEvent.click(genre.getByRole('option', { name: /^Rock/ }));
    await userEvent.click(genre.getByRole('option', { name: /^Jazz/ }));
    expect(dialog.getByRole('tab', { name: 'Genre (2)' })).toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Show 6 tracks' }));

    expect(useViewStore.getState().activeView).toBe('filter');
    await waitFor(() => expect(rows(canvasElement)).toHaveLength(6));
    expect(canvas.getByText('1 in use')).toBeInTheDocument();
  },
};
