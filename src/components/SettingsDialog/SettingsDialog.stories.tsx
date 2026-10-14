import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, screen, waitFor, within } from 'storybook/test';
import { useUiStore } from '@/client/stores/uiStore';
import { useViewStore } from '@/client/stores/viewStore';
import { fakeApi } from '../../../tests/helpers/stories';
import SettingsDialog from './SettingsDialog';

const meta = {
  title: 'Layout/SettingsDialog',
  component: SettingsDialog,
  beforeEach: () => useUiStore.getState().openSettings('library'),
} satisfies Meta<typeof SettingsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const dialog = () => within(screen.getByRole('dialog', { name: 'Settings' }));

/** Navidrome connection and the library sync status. */
export const Library: Story = {
  play: async () => {
    expect(await dialog().findByText('Connected · navidrome 0.64.2')).toBeInTheDocument();
    expect(await dialog().findByText('10 tracks · synced 5 minutes ago')).toBeInTheDocument();
    // Fully shown once the dialog's fade-in ends.
    await waitFor(() => expect(dialog().getByText('Connected · navidrome 0.64.2')).toBeVisible());
  },
};

/** "Rescan library" starts a sync and shows its progress. */
export const Rescan: Story = {
  play: async ({ userEvent }) => {
    await userEvent.click(await dialog().findByRole('button', { name: 'Rescan library' }));
    expect(await dialog().findByRole('button', { name: 'Syncing…' })).toBeDisabled();
    expect(dialog().getByRole('status')).toHaveTextContent(
      'Syncing “Main” (0/2 folders, 120 tracks)…',
    );
    expect(fakeApi().sent('POST', '/api/catalog/rescan')).toHaveLength(1);
  },
};

/** Theme choice and table layout reset. */
export const Appearance: Story = {
  beforeEach: () => {
    useUiStore.getState().openSettings('appearance');
    useViewStore.setState({ sorting: [{ id: 'title', desc: true }], columnSizing: { title: 400 } });
  },
  play: async ({ userEvent }) => {
    await userEvent.click(dialog().getByRole('button', { name: 'Dark' }));
    await waitFor(() =>
      expect(dialog().getByRole('button', { name: 'Dark' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    await userEvent.click(dialog().getByRole('button', { name: 'Light' }));

    await userEvent.click(dialog().getByRole('button', { name: 'Reset sort and column widths' }));
    expect(useViewStore.getState()).toMatchObject({ sorting: [], columnSizing: {} });
  },
};

export const Shortcuts: Story = {
  beforeEach: () => useUiStore.getState().openSettings('shortcuts'),
  play: async ({ userEvent }) => {
    const table = dialog().getByRole('table', { name: 'Keyboard shortcuts' });
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(5);
    await userEvent.click(dialog().getByRole('tab', { name: 'Library' }));
    expect(dialog().getByRole('tab', { selected: true })).toHaveTextContent('Library');
  },
};
