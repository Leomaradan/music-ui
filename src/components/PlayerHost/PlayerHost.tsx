'use client';

import { useEffect } from 'react';
import { tracksById } from '@/client/catalog/lookup';
import { AudioEngine } from '@/client/player/engine';
import { startQueuePersistence } from '@/client/player/persistence';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { attachEngine, selectCurrentTrackId, usePlayerStore } from '@/client/stores/playerStore';
import { useUiStore } from '@/client/stores/uiStore';

const ARTWORK_SIZES = [150, 300, 600] as const;
const player = () => usePlayerStore.getState();

/**
 * Wires the player (PLAN.md §7.1): audio engine, queue persistence, Media Session (OS media
 * keys, lock screen), keyboard shortcuts and the document title. Renders nothing.
 */
export default function PlayerHost() {
  useEffect(() => {
    const engine = new AudioEngine({
      status: (status) => usePlayerStore.getState().reportStatus(status),
      time: (position, duration) => usePlayerStore.getState().reportTime(position, duration),
      ended: () => usePlayerStore.getState().reportEnded(),
      error: (message) => usePlayerStore.getState().reportError(message),
    });
    const detach = attachEngine(engine);
    const stopPersistence = startQueuePersistence();
    const stopMediaSession = startMediaSession();
    const stopShortcuts = startShortcuts();
    const stopTitle = startDocumentTitle();
    return () => {
      stopTitle();
      stopShortcuts();
      stopMediaSession();
      stopPersistence();
      detach();
      engine.destroy();
    };
  }, []);
  return null;
}

function startMediaSession(): () => void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return () => {};
  const session = navigator.mediaSession;
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => player().play()],
    ['pause', () => player().pause()],
    ['stop', () => player().stop()],
    ['previoustrack', () => player().previous()],
    ['nexttrack', () => player().next()],
    ['seekto', (details) => details.seekTime !== undefined && player().seek(details.seekTime)],
  ];
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // Action not supported by this browser.
    }
  }

  let lastTrack: string | null = null;
  let lastCatalog: unknown = null;
  const update = () => {
    const state = player();
    const trackId = selectCurrentTrackId(state);
    const catalog = useCatalogStore.getState().catalog;
    if (trackId !== lastTrack || catalog !== lastCatalog) {
      lastTrack = trackId;
      lastCatalog = catalog;
      const track = trackId && catalog ? tracksById(catalog).get(trackId) : undefined;
      session.metadata = track
        ? new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: track.album,
            artwork: track.coverArt
              ? ARTWORK_SIZES.map((size) => ({
                  src: `/api/cover/${encodeURIComponent(track.coverArt!)}?size=${size}`,
                  sizes: `${size}x${size}`,
                }))
              : [],
          })
        : null;
    }
    session.playbackState =
      state.status === 'playing' || state.status === 'loading'
        ? 'playing'
        : state.status === 'paused'
          ? 'paused'
          : 'none';
    if (state.duration > 0 && 'setPositionState' in session) {
      try {
        session.setPositionState({
          duration: state.duration,
          position: Math.min(state.position, state.duration),
          playbackRate: 1,
        });
      } catch {
        // Invalid state during track changes.
      }
    }
  };
  const unsubscribePlayer = usePlayerStore.subscribe(update);
  const unsubscribeCatalog = useCatalogStore.subscribe(update);
  return () => {
    unsubscribePlayer();
    unsubscribeCatalog();
    for (const [action] of handlers) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // Ignore.
      }
    }
  };
}

const TYPING = 'input, textarea, select, [contenteditable="true"]';
const OWN_SPACE =
  'button, a, [role="button"], [role="option"], [role="slider"], [role="checkbox"], [role="menuitem"]';

function onShortcutKeyDown(event: KeyboardEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(TYPING)) return;
  if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    useUiStore.getState().openSettings('shortcuts');
  } else if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (target?.closest(OWN_SPACE)) return;
    event.preventDefault();
    player().toggle();
  } else if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowRight') {
    event.preventDefault();
    player().next();
  } else if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowLeft') {
    event.preventDefault();
    player().previous();
  }
}

/** Space: play/pause. Ctrl/Cmd + ←/→: previous/next track. ?: shortcuts (see SHORTCUTS). */
function startShortcuts(): () => void {
  window.addEventListener('keydown', onShortcutKeyDown);
  return () => window.removeEventListener('keydown', onShortcutKeyDown);
}

export const APP_TITLE = 'Music UI';

/** "▶ Title — Artist · Music UI" while a track is loaded. */
export function documentTitle(
  track: { title: string; artist: string } | undefined,
  playing: boolean,
): string {
  if (!track) return APP_TITLE;
  const name = [track.title, track.artist].filter(Boolean).join(' — ');
  return `${playing ? '▶ ' : ''}${name} · ${APP_TITLE}`;
}

function updateDocumentTitle(): void {
  const state = player();
  const trackId = selectCurrentTrackId(state);
  const catalog = useCatalogStore.getState().catalog;
  const track = trackId && catalog ? tracksById(catalog).get(trackId) : undefined;
  document.title = documentTitle(track, state.status === 'playing' || state.status === 'loading');
}

function startDocumentTitle(): () => void {
  updateDocumentTitle();
  const unsubscribePlayer = usePlayerStore.subscribe(updateDocumentTitle);
  const unsubscribeCatalog = useCatalogStore.subscribe(updateDocumentTitle);
  return () => {
    unsubscribePlayer();
    unsubscribeCatalog();
    document.title = APP_TITLE;
  };
}
