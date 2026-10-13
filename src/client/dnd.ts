/**
 * Dragging tracks to the sidebar, from the table rows or the filter boxes (native HTML drag
 * and drop: the dragged row may scroll out of a virtualized list during the drag).
 */
export const TRACKS_MIME = 'application/x-music-ui-tracks';
/** Suggested name for a playlist created from the drop (e.g. the dragged artist). */
export const NAME_MIME = 'application/x-music-ui-name';

let dragged: { trackIds: string[]; name: string | null } | null = null;

const countLabel = (n: number) => `${n} track${n === 1 ? '' : 's'}`;

/** Starts a drag of `trackIds` (call from a dragstart handler). */
export function startTrackDrag(
  dataTransfer: DataTransfer,
  trackIds: string[],
  name: string | null = null,
): void {
  dragged = { trackIds, name };
  const label = name ? `${name} · ${countLabel(trackIds.length)}` : countLabel(trackIds.length);
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(TRACKS_MIME, JSON.stringify(trackIds));
  if (name) dataTransfer.setData(NAME_MIME, name);
  dataTransfer.setData('text/plain', label);
  if (typeof document !== 'undefined' && 'setDragImage' in dataTransfer) {
    const ghost = document.createElement('div');
    ghost.textContent = label;
    Object.assign(ghost.style, {
      position: 'fixed',
      top: '-1000px',
      padding: '4px 10px',
      borderRadius: '12px',
      background: '#1e6b52',
      color: '#fff',
      font: '500 13px sans-serif',
    });
    document.body.append(ghost);
    dataTransfer.setDragImage(ghost, 12, 12);
    setTimeout(() => ghost.remove(), 0);
  }
}

export function endTrackDrag(): void {
  dragged = null;
}

/** True while tracks from this app are dragged over a target. */
export function isTrackDrag(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer && [...dataTransfer.types].includes(TRACKS_MIME));
}

/** Track ids carried by a drop (or null). */
export function droppedTracks(dataTransfer: DataTransfer | null): string[] | null {
  if (dragged) return dragged.trackIds;
  try {
    const raw = dataTransfer?.getData(TRACKS_MIME);
    const ids: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? ids : null;
  } catch {
    return null;
  }
}

/** Suggested playlist name carried by a drop (read it before `endTrackDrag`). */
export function droppedName(dataTransfer: DataTransfer | null): string | null {
  if (dragged) return dragged.name;
  return dataTransfer?.getData(NAME_MIME) || null;
}
