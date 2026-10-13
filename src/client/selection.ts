/** Row selection in a list (click, Ctrl/Cmd-click, Shift-click), independent of rendering. */
export interface Selection {
  ids: ReadonlySet<string>;
  /** Last row clicked without Shift: the fixed end of Shift ranges. */
  anchor: string | null;
}

export const EMPTY_SELECTION: Selection = { ids: new Set(), anchor: null };

export interface ClickModifiers {
  /** Shift: select the range from the anchor. */
  range?: boolean;
  /** Ctrl/Cmd: toggle this row, keep the others. */
  toggle?: boolean;
}

/** New selection after clicking `id` in the list `order` (the rows as displayed). */
export function clickSelection(
  selection: Selection,
  order: readonly string[],
  id: string,
  { range = false, toggle = false }: ClickModifiers = {},
): Selection {
  if (range && selection.anchor !== null) {
    const from = order.indexOf(selection.anchor);
    const to = order.indexOf(id);
    if (from !== -1 && to !== -1) {
      const [start, end] = from <= to ? [from, to] : [to, from];
      const ids = new Set(toggle ? selection.ids : []);
      for (const rowId of order.slice(start, end + 1)) ids.add(rowId);
      return { ids, anchor: selection.anchor };
    }
  }
  if (toggle) {
    const ids = new Set(selection.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return { ids, anchor: id };
  }
  return { ids: new Set([id]), anchor: id };
}

/** Moves a single selection up/down (arrow keys); with `extend`, grows the range instead. */
export function moveSelection(
  selection: Selection,
  order: readonly string[],
  delta: number,
  extend = false,
): { selection: Selection; focusIndex: number } | null {
  if (order.length === 0) return null;
  const lastSelected = order.findLastIndex((id) => selection.ids.has(id));
  const current = lastSelected === -1 ? (delta > 0 ? -1 : order.length) : lastSelected;
  const focusIndex = Math.min(order.length - 1, Math.max(0, current + delta));
  const id = order[focusIndex]!;
  return {
    selection: extend
      ? clickSelection(selection, order, id, { range: true })
      : { ids: new Set([id]), anchor: id },
    focusIndex,
  };
}
