import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';
import { useFilterStore } from '@/client/stores/filterStore';
import { useSelectionStore } from '@/client/stores/selectionStore';
import { trackByTitle } from '../../../tests/helpers/stories';
import StatusBar from './StatusBar';

const meta = {
  title: 'Library/StatusBar',
  component: StatusBar,
} satisfies Meta<typeof StatusBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const summary = (canvas: HTMLElement) =>
  within(canvas).getByRole('status', { name: 'Track summary' });

/** Count and total time of the listed tracks. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    expect(summary(canvasElement)).toHaveTextContent('10 tracks · 1 min');
  },
};

export const WithSelection: Story = {
  beforeEach: () => {
    const ids = ['Dancing Queen', 'Walk This Way'].map((t) => trackByTitle(t).id);
    useSelectionStore.getState().setSelection({ ids: new Set(ids), anchor: ids[0]! });
  },
  play: async ({ canvasElement }) => {
    expect(summary(canvasElement)).toHaveTextContent('10 tracks · 1 min · 2 selected');
  },
};

/** Tracks removed from the results can be restored. */
export const RemovedTracks: Story = {
  beforeEach: () => {
    useFilterStore
      .getState()
      .exclude([trackByTitle('Beach Night').id, trackByTitle('Sunny Day').id]);
  },
  play: async ({ canvasElement, userEvent }) => {
    expect(summary(canvasElement)).toHaveTextContent('8 tracks');
    expect(summary(canvasElement)).toHaveTextContent('2 removed from results');
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(summary(canvasElement)).toHaveTextContent('10 tracks · 1 min'));
    expect(useFilterStore.getState().excluded).toEqual([]);
  },
};
