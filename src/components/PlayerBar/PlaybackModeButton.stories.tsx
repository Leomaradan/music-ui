import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, screen, waitFor, within } from 'storybook/test';
import { PLAYBACK_MODES } from '@/client/player/modes';
import { usePlayerStore } from '@/client/stores/playerStore';
import { sampleCatalog } from '../../../tests/helpers/stories';
import PlaybackModeButton from './PlaybackModeButton';

const meta = {
  title: 'Player/PlaybackModeButton',
  component: PlaybackModeButton,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof PlaybackModeButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InOrder: Story = {
  play: async ({ canvasElement }) => {
    expect(
      within(canvasElement).getByRole('button', { name: 'Playback mode: In order' }),
    ).toBeVisible();
  },
};

/** The menu lists every mode; picking one changes the mode and the button. */
export const ChooseMode: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Playback mode/ }));
    const menu = await screen.findByRole('menu', { name: 'Playback mode' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.querySelector('span')?.textContent)).toEqual(
      PLAYBACK_MODES.map((entry) => entry.label),
    );

    await userEvent.click(within(menu).getByRole('menuitem', { name: /^Shuffle by album/ }));
    expect(usePlayerStore.getState().mode).toBe('albumShuffle');
    await waitFor(() =>
      expect(
        within(canvasElement).getByRole('button', { name: 'Playback mode: Shuffle by album' }),
      ).toBeVisible(),
    );
  },
};

/** Changing the mode while playing re-plans the upcoming tracks; the current one keeps playing. */
export const ReplanWhilePlaying: Story = {
  beforeEach: () => {
    const all = sampleCatalog.tracks.map((t) => t.id);
    usePlayerStore.getState().playSelection(all, 0);
  },
  play: async ({ canvasElement, userEvent }) => {
    const before = usePlayerStore.getState();
    const current = before.queue[before.index];
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Playback mode/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Shuffle(?! by)/ }));

    const after = usePlayerStore.getState();
    expect(after.mode).toBe('shuffle');
    expect(after.queue[after.index]).toBe(current);
    // Still every track once.
    expect(new Set(after.queue).size).toBe(sampleCatalog.tracks.length);
    expect(after.queue).toHaveLength(sampleCatalog.tracks.length);
  },
};
