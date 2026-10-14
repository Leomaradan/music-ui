import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, screen, waitFor, within } from 'storybook/test';
import { useDynamicPlaylistStore } from '@/client/stores/dynamicPlaylistStore';
import { useViewStore } from '@/client/stores/viewStore';
import { fakeApi } from '../../../tests/helpers/stories';
import DynamicPlaylistDialog from './DynamicPlaylistDialog';

const meta = {
  title: 'Playlists/DynamicPlaylistDialog',
  component: DynamicPlaylistDialog,
  // The smart playlists are loaded by CatalogLoader in the app.
  beforeEach: async () => {
    await useDynamicPlaylistStore.getState().load();
  },
} satisfies Meta<typeof DynamicPlaylistDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const dialog = () => within(screen.getByRole('dialog'));
const criterion = (n: number) => within(dialog().getByRole('group', { name: `Criterion ${n}` }));

/** Picks an option of a MUI select (the menu opens in a popover outside the dialog). */
async function choose(
  userEvent: { click(element: Element): Promise<void> },
  select: HTMLElement,
  option: string,
) {
  await userEvent.click(select);
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

/** A new smart playlist: Rock from 1975 on; the count follows the criteria; Save creates it. */
export const Create: Story = {
  beforeEach: () => useDynamicPlaylistStore.getState().edit(),
  play: async ({ userEvent }) => {
    const heading = await screen.findByRole('heading', { name: 'New smart playlist' });
    // Fully shown once the dialog's fade-in ends.
    await waitFor(() => expect(heading).toBeVisible());
    const name = dialog().getByRole('textbox', { name: /Name/ });
    await userEvent.clear(name);
    await userEvent.type(name, 'Late rock');
    expect(dialog().getByRole('status')).toHaveTextContent('Complete every criterion');

    await userEvent.type(criterion(1).getByRole('combobox', { name: 'Value' }), 'rock');
    await waitFor(() => expect(dialog().getByRole('status')).toHaveTextContent('4 tracks match'));

    await userEvent.click(dialog().getByRole('button', { name: 'Add criterion' }));
    await choose(userEvent, criterion(2).getByRole('combobox', { name: 'Tag' }), 'Year');
    await choose(userEvent, criterion(2).getByRole('combobox', { name: 'Condition' }), 'after');
    await userEvent.type(criterion(2).getByRole('spinbutton', { name: 'Value' }), '1976');
    await waitFor(() => expect(dialog().getByRole('status')).toHaveTextContent('2 tracks match'));

    await userEvent.click(dialog().getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fakeApi().sent('POST', '/api/dynamic-playlists')[0]?.body).toEqual({
      name: 'Late rock',
      match: 'all',
      criteria: [
        { field: 'genre', op: '==', value: 'rock' },
        { field: 'year', op: '>', value: 1976 },
      ],
    });
    expect(useViewStore.getState().activeView).toBe('dynamic:d3');
  },
};

/** Editing starts from the saved definition; "any criterion" widens the match. */
export const Edit: Story = {
  beforeEach: () => useDynamicPlaylistStore.getState().edit('d1'),
  play: async ({ userEvent }) => {
    const heading = await screen.findByRole('heading', { name: 'Edit smart playlist' });
    // Fully shown once the dialog's fade-in ends.
    await waitFor(() => expect(heading).toBeVisible());
    expect(dialog().getByRole('textbox', { name: /Name/ })).toHaveValue('70s rock');
    expect(criterion(1).getByRole('combobox', { name: 'Value' })).toHaveValue('Rock');
    expect(criterion(2).getByRole('spinbutton', { name: 'Value' })).toHaveValue(1980);
    expect(dialog().getByRole('status')).toHaveTextContent('3 tracks match');

    await userEvent.click(dialog().getByRole('button', { name: 'any criterion' }));
    expect(dialog().getByRole('status')).toHaveTextContent('8 tracks match');
    await userEvent.click(criterion(2).getByRole('button', { name: 'Remove criterion 2' }));
    expect(dialog().getByRole('status')).toHaveTextContent('4 tracks match');
    // The last criterion cannot be removed.
    expect(criterion(1).getByRole('button', { name: 'Remove criterion 1' })).toBeDisabled();

    await userEvent.click(dialog().getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fakeApi().sent('PUT', '/api/dynamic-playlists/d1')).toHaveLength(1));
    expect(useDynamicPlaylistStore.getState().playlists[0]).toMatchObject({
      match: 'any',
      criteria: [{ field: 'genre', op: '==', value: 'Rock' }],
    });
  },
};

/** Text tags only offer "is" and "is not"; the year adds ordering conditions. */
export const Conditions: Story = {
  beforeEach: () => useDynamicPlaylistStore.getState().edit(),
  play: async ({ userEvent }) => {
    await userEvent.click(await criterion(1).findByRole('combobox', { name: 'Condition' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'is',
      'is not',
    ]);
    await userEvent.keyboard('{Escape}');
    await choose(userEvent, criterion(1).getByRole('combobox', { name: 'Tag' }), 'Year');
    await userEvent.click(criterion(1).getByRole('combobox', { name: 'Condition' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'is',
      'is not',
      'before',
      'up to',
      'after',
      'from',
    ]);
  },
};
