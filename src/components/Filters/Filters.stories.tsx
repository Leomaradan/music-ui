import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';
import Box from '@mui/material/Box';
import { EMPTY_FILTERS } from '@/client/catalog/facets';
import { NAME_MIME, TRACKS_MIME } from '@/client/dnd';
import { useFilterStore } from '@/client/stores/filterStore';
import { useViewStore } from '@/client/stores/viewStore';
import { createDataTransfer, fireDrag } from '../../../tests/helpers/dnd';
import { titleOf } from '../../../tests/helpers/stories';
import Filters from './Filters';

const meta = {
  title: 'Library/Filters',
  component: Filters,
  decorators: [
    (Story) => (
      <Box sx={{ height: 260, display: 'grid' }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof Filters>;

export default meta;
type Story = StoryObj<typeof meta>;

const box = (canvas: HTMLElement, title: string) =>
  within(within(canvas).getByRole('listbox', { name: title }));
const option = (canvas: HTMLElement, title: string, name: string) =>
  box(canvas, title).getByRole('option', { name: new RegExp(`^${name}`) });
/** Labels of the options of a box, "All" excluded. */
const labels = (canvas: HTMLElement, title: string) =>
  box(canvas, title)
    .getAllByRole('option')
    .map((o) => o.querySelector('p')?.textContent)
    .filter((label) => label !== 'All');
const selectedLabels = (canvas: HTMLElement, title: string) =>
  box(canvas, title)
    .getAllByRole('option', { selected: true })
    .map((o) => o.querySelector('p')?.textContent);

/** Nothing selected: every box lists everything, "All" is selected. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    // Folders keep the server's order.
    expect(labels(canvasElement, 'Music Folder')).toEqual(['Main', 'Live']);
    expect(labels(canvasElement, 'Genre')).toEqual(['Dance', 'Jazz', 'Pop', 'Rock']);
    expect(labels(canvasElement, 'Artist')).toEqual([
      'ABBA',
      'Aerosmith',
      'Miles Davis',
      'Various Artists',
    ]);
    for (const title of ['Music Folder', 'Genre', 'Artist', 'Album']) {
      expect(selectedLabels(canvasElement, title)).toEqual(['All']);
    }
  },
};

/** The Album box shows each album with its year only, not its artist. */
export const AlbumShowsYear: Story = {
  play: async ({ canvasElement }) => {
    const arrival = option(canvasElement, 'Album', 'Arrival');
    expect(arrival).toHaveTextContent(/^Arrival1976/);
    expect(arrival).not.toHaveTextContent('ABBA');
  },
};

/** A plain click selects one value and drops the previous selection. */
export const ClickSelectsOne: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(option(canvasElement, 'Artist', 'ABBA'));
    await userEvent.click(option(canvasElement, 'Artist', 'Aerosmith'));
    expect(selectedLabels(canvasElement, 'Artist')).toEqual(['Aerosmith']);
    expect(useFilterStore.getState().filters.artists).toEqual(['Aerosmith']);
  },
};

/** Ctrl-click adds or removes one value. */
export const CtrlToggles: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(option(canvasElement, 'Artist', 'ABBA'));
    await userEvent.keyboard('{Control>}');
    await userEvent.click(option(canvasElement, 'Artist', 'Miles Davis'));
    expect(selectedLabels(canvasElement, 'Artist')).toEqual(['ABBA', 'Miles Davis']);
    await userEvent.click(option(canvasElement, 'Artist', 'ABBA'));
    await userEvent.keyboard('{/Control}');
    expect(selectedLabels(canvasElement, 'Artist')).toEqual(['Miles Davis']);
  },
};

/** Shift-click selects the range from the last plain click. */
export const ShiftSelectsRange: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(option(canvasElement, 'Artist', 'ABBA'));
    await userEvent.keyboard('{Shift>}');
    await userEvent.click(option(canvasElement, 'Artist', 'Miles Davis'));
    await userEvent.keyboard('{/Shift}');
    expect(selectedLabels(canvasElement, 'Artist')).toEqual(['ABBA', 'Aerosmith', 'Miles Davis']);
  },
};

/**
 * Each box lists what the boxes before it allow; changing a box clears the ones after it and
 * shows the filter results.
 */
export const Cascade: Story = {
  beforeEach: () => {
    useViewStore.getState().setActiveView('queue');
  },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(option(canvasElement, 'Genre', 'Rock'));
    expect(useViewStore.getState().activeView).toBe('filter');
    expect(labels(canvasElement, 'Artist')).toEqual(['Aerosmith']);
    expect(labels(canvasElement, 'Album')).toEqual(['Live! Bootleg', 'Pump', 'Toys in the Attic']);

    await userEvent.click(option(canvasElement, 'Artist', 'Aerosmith'));
    await userEvent.click(option(canvasElement, 'Album', 'Pump'));
    expect(useFilterStore.getState().filters).toMatchObject({
      artists: ['Aerosmith'],
      albums: [expect.any(String)],
    });

    // A new genre clears the artist and album selections.
    await userEvent.click(option(canvasElement, 'Genre', 'Jazz'));
    expect(useFilterStore.getState().filters).toEqual({
      ...EMPTY_FILTERS,
      genres: ['Jazz'],
    });
    expect(labels(canvasElement, 'Artist')).toEqual(['Miles Davis']);
    expect(selectedLabels(canvasElement, 'Artist')).toEqual(['All']);
  },
};

/** The search field narrows a box (accents and case ignored). */
export const Search: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Search Artist' }), 'AERO');
    await waitFor(() => expect(labels(canvasElement, 'Artist')).toEqual(['Aerosmith']));
    // "All" is hidden while searching.
    expect(box(canvasElement, 'Artist').getAllByRole('option')).toHaveLength(1);
  },
};

/** Dragging a value carries its tracks and a playlist name; the filters do not change. */
export const DragValue: Story = {
  play: async ({ canvasElement }) => {
    expect(option(canvasElement, 'Artist', 'All')).toHaveAttribute('draggable', 'false');
    const aerosmith = option(canvasElement, 'Artist', 'Aerosmith');
    expect(aerosmith).toHaveAttribute('draggable', 'true');

    const transfer = createDataTransfer();
    fireDrag(aerosmith, 'dragstart', transfer);
    fireDrag(aerosmith, 'dragend', transfer);
    expect(transfer.data[NAME_MIME]).toBe('Aerosmith');
    expect(transfer.data['text/plain']).toBe('Aerosmith · 4 tracks');
    expect((JSON.parse(transfer.data[TRACKS_MIME]!) as string[]).map(titleOf)).toEqual([
      'Walk This Way',
      'Sweet Emotion',
      'Back in the Saddle (Live)',
      'Love in an Elevator',
    ]);
    expect(useFilterStore.getState().filters).toEqual(EMPTY_FILTERS);
  },
};

/** Dragging one of several selected values carries all of them. */
export const DragSelection: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(option(canvasElement, 'Artist', 'ABBA'));
    await userEvent.keyboard('{Control>}');
    await userEvent.click(option(canvasElement, 'Artist', 'Miles Davis'));
    await userEvent.keyboard('{/Control}');

    const transfer = createDataTransfer();
    fireDrag(option(canvasElement, 'Artist', 'ABBA'), 'dragstart', transfer);
    fireDrag(option(canvasElement, 'Artist', 'ABBA'), 'dragend', transfer);
    expect(transfer.data[NAME_MIME]).toBe('ABBA, Miles Davis');
    expect(JSON.parse(transfer.data[TRACKS_MIME]!)).toHaveLength(4);
  },
};
