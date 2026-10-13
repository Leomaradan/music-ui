'use client';

import { PLAYBACK_MODES, type PlaybackMode } from '@/client/player/modes';
import { queueWindow } from '@/client/player/queue';
import { usePlayerStore } from '@/client/stores/playerStore';

const LOCAL_KEY = 'music-ui:player';
/** The server keeps at most this many tracks (see /api/queue). */
export const MAX_SERVER_QUEUE = 5_000;
const SERVER_DEBOUNCE_MS = 2_000;
const POSITION_SAVE_MS = 30_000;
const LOCAL_POSITION_SAVE_MS = 5_000;
/** Playback resumes on load only if it was playing this recently (a reload, not a new day). */
export const RESUME_WINDOW_MS = 60_000;

interface Saved {
  queue: string[];
  index: number;
  position: number;
  volume: number;
  /** A track was playing when this was saved. */
  playing: boolean;
  /** Epoch ms of the save. */
  savedAt: number;
  mode: PlaybackMode;
  /** What the playback modes draw from (see playerStore). */
  selection: string[];
}

const isMode = (value: unknown): value is PlaybackMode =>
  PLAYBACK_MODES.some((entry) => entry.mode === value);
const stringArray = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : null;

function readLocal(): Saved | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Saved>;
    if (!Array.isArray(saved.queue)) return null;
    return {
      queue: saved.queue.filter((id): id is string => typeof id === 'string'),
      index: typeof saved.index === 'number' ? saved.index : -1,
      position: typeof saved.position === 'number' ? saved.position : 0,
      volume: typeof saved.volume === 'number' ? saved.volume : 1,
      playing: saved.playing === true,
      savedAt: typeof saved.savedAt === 'number' ? saved.savedAt : 0,
      mode: isMode(saved.mode) ? saved.mode : 'order',
      selection: stringArray(saved.selection) ?? [],
    };
  } catch {
    return null;
  }
}

function writeLocal(): void {
  const { queue, index, position, volume, status, mode, selection } = usePlayerStore.getState();
  const saved: Saved = {
    mode,
    selection,
    queue,
    index,
    position,
    volume,
    playing: status === 'playing' || status === 'loading',
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(saved));
  } catch {
    // Storage full or blocked: the server copy still works.
  }
}

async function saveToServer(): Promise<void> {
  const { queue, index, position } = usePlayerStore.getState();
  const { ids, index: windowIndex } = queueWindow(queue, index, MAX_SERVER_QUEUE);
  try {
    await fetch('/api/queue', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids, index: windowIndex, position: windowIndex >= 0 ? position : 0 }),
      keepalive: true,
    });
  } catch {
    // Offline: the next change retries.
  }
}

function onHide(): void {
  if (document.visibilityState === 'hidden') {
    writeLocal();
    void saveToServer();
  }
}

/** The page is going away (reload, navigation, tab closed): save the exact position. */
function onPageHide(): void {
  writeLocal();
}

/**
 * Keeps "Currently playing" across reloads (PLAN.md §7.5): restores it from this browser,
 * or from the account's play queue on Navidrome when this browser has none, and resumes
 * playback if it was playing right before a reload; then saves changes locally at once and
 * to Navidrome debounced (and every 30 s while playing).
 */
export function startQueuePersistence(): () => void {
  const local = readLocal();
  if (local) {
    usePlayerStore.getState().restore({
      ...local,
      selection: local.selection.length ? local.selection : local.queue,
    });
    // It was playing just before the page reloaded: carry on (the browser may require a
    // click first, see PlayerHost).
    if (local.playing && local.index >= 0 && Date.now() - local.savedAt < RESUME_WINDOW_MS) {
      usePlayerStore.getState().play();
    }
  } else {
    void fetch('/api/queue', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((remote: { ids: string[]; index: number; position: number } | null) => {
        if (remote && remote.ids.length > 0 && usePlayerStore.getState().queue.length === 0) {
          usePlayerStore.getState().restore({ queue: remote.ids, ...remote });
        }
      })
      .catch(() => {});
  }

  let serverTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleServerSave = () => {
    if (serverTimer) clearTimeout(serverTimer);
    serverTimer = setTimeout(() => void saveToServer(), SERVER_DEBOUNCE_MS);
  };

  const unsubscribe = usePlayerStore.subscribe((state, previous) => {
    const queueChanged = state.queue !== previous.queue || state.index !== previous.index;
    const stopped =
      state.status !== previous.status && (state.status === 'paused' || state.status === 'stopped');
    const settingsChanged = state.volume !== previous.volume || state.mode !== previous.mode;
    if (queueChanged || stopped || settingsChanged) writeLocal();
    if (queueChanged || stopped) scheduleServerSave();
  });

  // Positions change several times a second: save them on a timer instead.
  const localTimer = setInterval(() => {
    if (usePlayerStore.getState().status === 'playing') writeLocal();
  }, LOCAL_POSITION_SAVE_MS);
  const remoteTimer = setInterval(() => {
    if (usePlayerStore.getState().status === 'playing') void saveToServer();
  }, POSITION_SAVE_MS);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    unsubscribe();
    if (serverTimer) clearTimeout(serverTimer);
    clearInterval(localTimer);
    clearInterval(remoteTimer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
  };
}
