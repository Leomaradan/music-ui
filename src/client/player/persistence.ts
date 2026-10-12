'use client';

import { queueWindow } from '@/client/player/queue';
import { usePlayerStore } from '@/client/stores/playerStore';

const LOCAL_KEY = 'music-ui:player';
/** The server keeps at most this many tracks (see /api/queue). */
export const MAX_SERVER_QUEUE = 5_000;
const SERVER_DEBOUNCE_MS = 2_000;
const POSITION_SAVE_MS = 30_000;
const LOCAL_POSITION_SAVE_MS = 5_000;

interface Saved {
  queue: string[];
  index: number;
  position: number;
  volume: number;
}

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
    };
  } catch {
    return null;
  }
}

function writeLocal(): void {
  const { queue, index, position, volume } = usePlayerStore.getState();
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ queue, index, position, volume }));
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

/**
 * Keeps "Currently playing" across reloads (PLAN.md §7.5): restores it from this browser,
 * or from the account's play queue on Navidrome when this browser has none; then saves
 * changes locally at once and to Navidrome debounced (and every 30 s while playing).
 */
export function startQueuePersistence(): () => void {
  const local = readLocal();
  if (local) {
    usePlayerStore.getState().restore(local);
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
    if (queueChanged || stopped || state.volume !== previous.volume) writeLocal();
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

  return () => {
    unsubscribe();
    if (serverTimer) clearTimeout(serverTimer);
    clearInterval(localTimer);
    clearInterval(remoteTimer);
    document.removeEventListener('visibilitychange', onHide);
  };
}
