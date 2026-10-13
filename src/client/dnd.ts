/**
 * Dragging tracks from the table to the sidebar (native HTML drag and drop: the dragged row
 * may scroll out of the virtualized table during the drag).
 */
export const TRACKS_MIME = 'application/x-music-ui-tracks';

let dragged: string[] | null = null;

/** Starts a drag of `trackIds` (call from the row's dragstart). */
export function startTrackDrag(dataTransfer: DataTransfer, trackIds: string[]): void {
  dragged = trackIds;
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(TRACKS_MIME, JSON.stringify(trackIds));
  dataTransfer.setData('text/plain', `${trackIds.length} track${trackIds.length === 1 ? '' : 's'}`);
  if (typeof document !== 'undefined' && 'setDragImage' in dataTransfer) {
    const ghost = document.createElement('div');
    ghost.textContent = `${trackIds.length} track${trackIds.length === 1 ? '' : 's'}`;
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
  if (dragged) return dragged;
  try {
    const raw = dataTransfer?.getData(TRACKS_MIME);
    const ids: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? ids : null;
  } catch {
    return null;
  }
}
