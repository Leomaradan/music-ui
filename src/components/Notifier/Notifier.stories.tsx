import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, screen, waitFor } from 'storybook/test';
import { notify, useNotificationStore } from '@/client/stores/notificationStore';
import Notifier from './Notifier';

const meta = {
  title: 'Layout/Notifier',
  component: Notifier,
} satisfies Meta<typeof Notifier>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  beforeEach: () => notify('Added 3 tracks to “Road trip”', 'success'),
  play: async () => {
    const message = await screen.findByText('Added 3 tracks to “Road trip”');
    await waitFor(() => expect(message).toBeVisible());
  },
};

export const ErrorMessage: Story = {
  name: 'Error',
  beforeEach: () => notify('Could not add the tracks: The server answered HTTP 500', 'error'),
  play: async () => {
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not add the tracks');
  },
};

/** The close button dismisses the message. */
export const Dismiss: Story = {
  beforeEach: () => notify('Library synced: 10 tracks'),
  play: async ({ userEvent }) => {
    await screen.findByText('Library synced: 10 tracks');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(useNotificationStore.getState().current).toBeNull());
  },
};
