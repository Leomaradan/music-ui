import { EMPTY_SELECTION, clickSelection, moveSelection, type Selection } from './selection';

const order = ['a', 'b', 'c', 'd', 'e'];
const ids = (selection: Selection) => [...selection.ids].toSorted();

describe('clickSelection', () => {
  it('selects only the clicked row', () => {
    const one = clickSelection(EMPTY_SELECTION, order, 'b');
    expect(ids(one)).toEqual(['b']);
    expect(ids(clickSelection(one, order, 'd'))).toEqual(['d']);
  });

  it('toggles with Ctrl/Cmd', () => {
    let selection = clickSelection(EMPTY_SELECTION, order, 'b');
    selection = clickSelection(selection, order, 'd', { toggle: true });
    expect(ids(selection)).toEqual(['b', 'd']);
    selection = clickSelection(selection, order, 'b', { toggle: true });
    expect(ids(selection)).toEqual(['d']);
  });

  it('selects a range from the anchor with Shift, in both directions', () => {
    const anchored = clickSelection(EMPTY_SELECTION, order, 'b');
    expect(ids(clickSelection(anchored, order, 'd', { range: true }))).toEqual(['b', 'c', 'd']);
    const reversed = clickSelection(anchored, order, 'a', { range: true });
    expect(ids(reversed)).toEqual(['a', 'b']);
    expect(reversed.anchor).toBe('b');
  });

  it('adds a range to the selection with Ctrl+Shift', () => {
    let selection = clickSelection(EMPTY_SELECTION, order, 'a');
    selection = clickSelection(selection, order, 'd', { toggle: true });
    selection = clickSelection(selection, order, 'e', { range: true, toggle: true });
    expect(ids(selection)).toEqual(['a', 'd', 'e']);
  });

  it('falls back to a single selection without a usable anchor', () => {
    expect(ids(clickSelection(EMPTY_SELECTION, order, 'c', { range: true }))).toEqual(['c']);
  });
});

describe('moveSelection', () => {
  it('starts at the first / last row', () => {
    expect(moveSelection(EMPTY_SELECTION, order, 1)?.focusIndex).toBe(0);
    expect(moveSelection(EMPTY_SELECTION, order, -1)?.focusIndex).toBe(4);
  });

  it('moves and stops at the ends', () => {
    const at = (id: string) => clickSelection(EMPTY_SELECTION, order, id);
    expect(ids(moveSelection(at('b'), order, 1)!.selection)).toEqual(['c']);
    expect(moveSelection(at('e'), order, 1)?.focusIndex).toBe(4);
  });

  it('extends the range with Shift', () => {
    const moved = moveSelection(clickSelection(EMPTY_SELECTION, order, 'b'), order, 1, true)!;
    expect(ids(moved.selection)).toEqual(['b', 'c']);
  });

  it('does nothing on an empty list', () => {
    expect(moveSelection(EMPTY_SELECTION, [], 1)).toBeNull();
  });
});
