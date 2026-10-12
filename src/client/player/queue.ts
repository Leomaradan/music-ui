/** Pure play queue operations. A queue is a list of track ids (duplicates allowed). */

/** Seconds after which "previous" restarts the current track instead. */
export const RESTART_THRESHOLD = 3;

export interface QueueRemoval {
  queue: string[];
  /** New index of the current track; -1 when no track is current any more. */
  index: number;
  /** The current track was removed: `index` now points at the track that followed it. */
  currentRemoved: boolean;
}

export function removeFromQueue(
  queue: readonly string[],
  index: number,
  remove: Iterable<number>,
): QueueRemoval {
  const removed = new Set(remove);
  const next = queue.filter((_, i) => !removed.has(i));
  if (index < 0) return { queue: next, index: -1, currentRemoved: false };
  const before = [...removed].filter((i) => i < index).length;
  const currentRemoved = removed.has(index);
  let newIndex = index - before;
  if (currentRemoved && newIndex >= next.length) newIndex = -1;
  return { queue: next, index: newIndex, currentRemoved };
}

/** The window of at most `max` tracks saved to the server, keeping the current track in it. */
export function queueWindow(
  queue: readonly string[],
  index: number,
  max: number,
): { ids: string[]; index: number } {
  if (queue.length <= max) return { ids: [...queue], index };
  const start = Math.max(0, Math.min(index - Math.floor(max / 10), queue.length - max));
  return { ids: queue.slice(start, start + max), index: index < 0 ? -1 : index - start };
}
