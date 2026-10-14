import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';
import { usePlayerStore } from '@/client/stores/playerStore';
import PlayerHost from '@/components/PlayerHost/PlayerHost';
import { fakeApi, titleOf, trackByTitle } from '../../../tests/helpers/stories';
import PlayerBar from './PlayerBar';

/**
 * The player bar with the real audio engine (PlayerHost). Storybook serves every track as a
 * 30 s silent WAV (.storybook/main.ts), so playback really starts, pauses and seeks.
 */
const meta = {
  title: 'Player/PlayerBar',
  component: PlayerBar,
  decorators: [
    (Story) => (
      <>
        <PlayerHost />
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof PlayerBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const ids = (...titles: string[]) => titles.map((t) => trackByTitle(t).id);
const button = (canvas: HTMLElement, name: string) => within(canvas).getByRole('button', { name });
const waitForStatus = (status: string) =>
  waitFor(() => expect(usePlayerStore.getState().status).toBe(status), { timeout: 5_000 });

/** Nothing queued: the transport buttons and the slider are disabled. */
export const Idle: Story = {
  play: async ({ canvasElement }) => {
    for (const name of ['Previous', 'Play', 'Stop', 'Next']) {
      expect(button(canvasElement, name)).toBeDisabled();
    }
    expect(within(canvasElement).getByRole('slider', { name: 'Playback position' })).toBeDisabled();
  },
};

/** Play, pause, next, previous and stop drive the audio element. */
export const Transport: Story = {
  play: async ({ canvasElement, userEvent }) => {
    usePlayerStore
      .getState()
      .playQueue(ids('Walk This Way', 'Sweet Emotion', 'Love in an Elevator'), 0);
    await waitForStatus('playing');
    expect(within(canvasElement).getByText('Walk This Way')).toBeVisible();

    await userEvent.click(button(canvasElement, 'Pause'));
    await waitForStatus('paused');

    // Next while paused moves on without playing.
    await userEvent.click(button(canvasElement, 'Next'));
    await waitFor(() => expect(within(canvasElement).getByText('Sweet Emotion')).toBeVisible());
    expect(usePlayerStore.getState().status).not.toBe('playing');

    await userEvent.click(button(canvasElement, 'Play'));
    await waitForStatus('playing');
    await userEvent.click(button(canvasElement, 'Next'));
    await waitFor(() =>
      expect(within(canvasElement).getByText('Love in an Elevator')).toBeVisible(),
    );
    await waitForStatus('playing');
    // The last track: nothing after it.
    expect(button(canvasElement, 'Next')).toBeDisabled();

    await userEvent.click(button(canvasElement, 'Previous'));
    await waitFor(() => expect(within(canvasElement).getByText('Sweet Emotion')).toBeVisible());

    await userEvent.click(button(canvasElement, 'Stop'));
    await waitForStatus('stopped');
    expect(usePlayerStore.getState().position).toBe(0);
    expect(button(canvasElement, 'Play')).toBeEnabled();
  },
};

/** The slider seeks in the current track. */
export const Seek: Story = {
  play: async ({ canvasElement, userEvent }) => {
    usePlayerStore.getState().playQueue(ids('Dancing Queen'), 0);
    await waitForStatus('playing');
    await userEvent.click(button(canvasElement, 'Pause'));
    await waitForStatus('paused');

    // Click at 3/4 of the slider (keyboard on a native range input needs trusted events).
    const slider = within(canvasElement).getByRole('slider', { name: 'Playback position' });
    const rail = slider.closest<HTMLElement>('.MuiSlider-root')!;
    const box = rail.getBoundingClientRect();
    const coords = { clientX: box.left + box.width * 0.75, clientY: box.top + box.height / 2 };
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: rail, coords },
      { keys: '[/MouseLeft]', target: rail, coords },
    ]);
    const { duration } = usePlayerStore.getState();
    await waitFor(() =>
      expect(usePlayerStore.getState().position).toBeCloseTo(duration * 0.75, -0.5),
    );
    expect(usePlayerStore.getState().status).toBe('paused');
  },
};

/** The queue comes back after a reload and resumes if it was playing a moment ago. */
export const ResumeAfterReload: Story = {
  beforeEach: () => {
    localStorage.setItem(
      'music-ui:player',
      JSON.stringify({
        queue: ids('So What (Live)', 'Stella by Starlight (Live)'),
        index: 1,
        position: 4,
        volume: 1,
        playing: true,
        savedAt: Date.now() - 5_000,
        mode: 'order',
        selection: [],
      }),
    );
  },
  play: async ({ canvasElement }) => {
    await waitForStatus('playing');
    const { queue, index, position } = usePlayerStore.getState();
    expect(titleOf(queue[index]!)).toBe('Stella by Starlight (Live)');
    expect(position).toBeGreaterThanOrEqual(4);
    expect(within(canvasElement).getByText('Stella by Starlight (Live)')).toBeVisible();
    // Restored from this browser: the server copy is not needed.
    expect(fakeApi().sent('GET', '/api/queue')).toHaveLength(0);
  },
};

/** A queue saved on the server is restored (paused) when this browser has none. */
export const RestoreFromServer: Story = {
  parameters: {
    fakeApi: { queue: { ids: ids('Walk This Way'), index: 0, position: 0 } },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText('Walk This Way')).toBeVisible());
    expect(usePlayerStore.getState().status).not.toBe('playing');
  },
};

/** Playback errors are shown under the title. */
export const PlaybackError: Story = {
  beforeEach: () => {
    usePlayerStore.setState({
      queue: ids('Beach Night'),
      selection: ids('Beach Night'),
      index: 0,
      status: 'paused',
      error: 'The track is unavailable or its format is not supported',
    });
  },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText(/The track is unavailable/)).toBeVisible();
  },
};
