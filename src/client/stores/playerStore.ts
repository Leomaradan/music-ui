'use client';

import { create } from 'zustand';
import { tracksById, unknownTrack } from '@/client/catalog/lookup';
import {
  isEndless,
  nextUnit,
  planQueue,
  replanUpcoming,
  toModeTrack,
  type ModeTrack,
  type PlaybackMode,
} from '@/client/player/modes';
import { RESTART_THRESHOLD, removeFromQueue } from '@/client/player/queue';
import { useCatalogStore } from './catalogStore';

export type PlaybackStatus = 'stopped' | 'loading' | 'playing' | 'paused';

/** What the store needs from the audio layer (PLAN.md §7.1). */
export interface PlayerEngine {
  /** Loads the track if it is not the loaded one, then plays, from `startAt` seconds if given. */
  play(trackId: string, startAt?: number): void;
  /** Loads the track without playing. */
  cue(trackId: string, startAt?: number): void;
  pause(): void;
  /** Pauses and rewinds. */
  stop(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  /** Starts downloading the track expected next (null: nothing to preload). */
  preload(trackId: string | null): void;
}

interface PlayerState {
  /** Track ids of "Currently playing" (duplicates allowed). */
  queue: string[];
  /** The tracks playback was started from (table rows, playlist): what the modes draw from. */
  selection: string[];
  mode: PlaybackMode;
  /** Current track in `queue`, -1 when none. */
  index: number;
  status: PlaybackStatus;
  /** Seconds into the current track. */
  position: number;
  /** Seconds, from the audio element (0 until known). */
  duration: number;
  volume: number;
  error: string | null;
  /**
   * The browser blocked playback (autoplay policy, e.g. resuming after a page reload):
   * the next click or key press anywhere resumes it (see PlayerHost).
   */
  resumePending: boolean;

  /** Replaces the queue with these tracks, as they are, and plays from `startIndex`. */
  playQueue(trackIds: string[], startIndex: number): void;
  /**
   * Plays a selection in the current mode: `start` is the track the user picked (played
   * first), or null to let the mode choose (a playlist played as a whole).
   */
  playSelection(trackIds: string[], start: number | null): void;
  /** Changes the mode; during playback, what comes next is re-planned, history is kept. */
  setMode(mode: PlaybackMode): void;
  /** Jumps to a queue entry (plays it, or only selects it with `autoplay: false`). */
  playIndex(index: number, autoplay?: boolean): void;
  enqueue(trackIds: string[]): void;
  /** Inserts tracks right after the current one (appends when nothing plays). */
  playNext(trackIds: string[]): void;
  removeFromQueue(indexes: Iterable<number>): void;
  play(): void;
  pause(): void;
  toggle(): void;
  stop(): void;
  /** Next track; keeps playing if playing, otherwise only moves. */
  next(): void;
  /** Restarts the track after 3 s, otherwise goes to the previous one. */
  previous(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;

  /** Restores a saved queue (stopped, at the saved position). */
  restore(saved: {
    queue: string[];
    index: number;
    position: number;
    volume?: number;
    mode?: PlaybackMode;
    selection?: string[];
  }): void;

  // Reports from the engine.
  reportStatus(status: PlaybackStatus): void;
  reportTime(position: number, duration: number): void;
  reportEnded(): void;
  reportError(message: string): void;
  reportBlocked(): void;
}

export const BLOCKED_MESSAGE =
  'The browser blocked playback: click anywhere or press a key to resume.';

let engine: PlayerEngine | null = null;

/** Connects the audio layer; returns a function that disconnects it. */
export function attachEngine(next: PlayerEngine): () => void {
  engine = next;
  const { volume } = usePlayerStore.getState();
  next.setVolume(volume);
  return () => {
    if (engine === next) engine = null;
  };
}

/** Seconds kept before the end of a track when seeking. */
const END_MARGIN = 0.25;
/** Unplayable tracks are skipped, but only this many in a row (e.g. the server is down). */
export const MAX_CONSECUTIVE_ERRORS = 3;

const isActive = (status: PlaybackStatus) => status === 'playing' || status === 'loading';

/** Mode metadata for track ids (from the catalog; unknown ids stand alone). */
function modeTracksOf(ids: readonly string[]): ModeTrack[] {
  const catalog = useCatalogStore.getState().catalog;
  const byId = catalog ? tracksById(catalog) : undefined;
  return ids.map((id) => toModeTrack(byId?.get(id) ?? unknownTrack(id)));
}

export const usePlayerStore = create<PlayerState>()((set, get) => {
  let consecutiveErrors = 0;
  /** Endless modes: keep at least one track after the current one. */
  const extendQueue = () => {
    const { mode, selection, queue, index } = get();
    if (!isEndless(mode) || selection.length === 0 || index < queue.length - 1) return;
    const unit = nextUnit(mode, modeTracksOf(selection), queue);
    if (unit.length) set({ queue: [...queue, ...unit] });
  };
  const preloadNext = () => {
    extendQueue();
    const { queue, index } = get();
    engine?.preload(index >= 0 ? (queue[index + 1] ?? null) : null);
  };

  return {
    queue: [],
    selection: [],
    mode: 'order',
    index: -1,
    status: 'stopped',
    position: 0,
    duration: 0,
    volume: 1,
    error: null,
    resumePending: false,

    playQueue(trackIds, startIndex) {
      set({ queue: [...trackIds], selection: [...trackIds] });
      get().playIndex(startIndex);
    },

    playSelection(trackIds, start) {
      const plan = planQueue(get().mode, modeTracksOf(trackIds), start);
      if (plan.index < 0) return;
      set({ queue: plan.queue, selection: [...trackIds] });
      get().playIndex(plan.index);
    },

    setMode(mode) {
      const { queue, index, selection } = get();
      set({ mode });
      if (index < 0 || selection.length === 0) return;
      const history = queue.slice(0, index + 1);
      const upcoming = replanUpcoming(mode, modeTracksOf(selection), history);
      set({ queue: [...history, ...upcoming] });
      preloadNext();
    },

    playIndex(index, autoplay = true) {
      const id = get().queue[index];
      if (id === undefined) return;
      set({
        index,
        position: 0,
        duration: 0,
        error: null,
        resumePending: false,
        status: autoplay ? 'loading' : 'stopped',
      });
      if (autoplay) engine?.play(id, 0);
      else engine?.cue(id, 0);
      preloadNext();
    },

    enqueue(trackIds) {
      set({ queue: [...get().queue, ...trackIds] });
      preloadNext();
    },

    playNext(trackIds) {
      const { queue, index } = get();
      if (index < 0) return get().enqueue(trackIds);
      set({ queue: [...queue.slice(0, index + 1), ...trackIds, ...queue.slice(index + 1)] });
      preloadNext();
    },

    removeFromQueue(indexes) {
      const { queue, index, status } = get();
      const result = removeFromQueue(queue, index, indexes);
      set({ queue: result.queue, index: result.index });
      if (result.currentRemoved) {
        if (result.index >= 0) get().playIndex(result.index, isActive(status));
        else {
          engine?.stop();
          set({ status: 'stopped', position: 0, duration: 0 });
        }
      } else {
        preloadNext();
      }
    },

    play() {
      const { queue, index, position } = get();
      if (queue.length === 0) return;
      if (index < 0) return get().playIndex(0);
      set({ status: 'loading', error: null, resumePending: false });
      engine?.play(queue[index]!, position);
    },

    pause() {
      engine?.pause();
      set({ resumePending: false });
      if (get().status !== 'stopped') set({ status: 'paused' });
    },

    toggle() {
      if (isActive(get().status)) get().pause();
      else get().play();
    },

    stop() {
      engine?.stop();
      set({ status: 'stopped', position: 0, resumePending: false });
    },

    next() {
      const { index, queue, status } = get();
      if (index < queue.length - 1) get().playIndex(index + 1, isActive(status));
    },

    previous() {
      const { index, position, status } = get();
      if (position > RESTART_THRESHOLD || index <= 0) get().seek(0);
      else get().playIndex(index - 1, isActive(status));
    },

    seek(seconds) {
      const { duration } = get();
      // Stop just short of the end: a paused track seeked to its very end would restart
      // from 0 on play (browser behavior) instead of moving on to the next track.
      const max = duration > 0 ? Math.max(0, duration - END_MARGIN) : Infinity;
      const position = Math.max(0, Math.min(seconds, max));
      set({ position });
      engine?.seek(position);
    },

    setVolume(volume) {
      const clamped = Math.min(1, Math.max(0, volume));
      set({ volume: clamped });
      engine?.setVolume(clamped);
    },

    restore({ queue, index, position, volume, mode, selection }) {
      const valid = index >= 0 && index < queue.length;
      set({
        queue,
        selection: selection ?? queue,
        ...(mode ? { mode } : {}),
        index: valid ? index : -1,
        position: valid ? position : 0,
        status: 'stopped',
        ...(volume === undefined ? {} : { volume }),
      });
      if (volume !== undefined) engine?.setVolume(volume);
    },

    reportStatus(status) {
      // A "paused" event follows stop(): keep "stopped".
      if (status === 'paused' && get().status === 'stopped') return;
      if (status === 'playing') consecutiveErrors = 0;
      set({ status });
    },

    reportTime(position, duration) {
      set({ position, duration: Number.isFinite(duration) ? duration : 0 });
    },

    reportBlocked() {
      set({ status: 'paused', resumePending: true, error: BLOCKED_MESSAGE });
    },

    reportEnded() {
      const { index, queue } = get();
      if (index < queue.length - 1) get().playIndex(index + 1, true);
      else set({ status: 'stopped', position: 0 });
    },

    reportError(message) {
      const { index, queue } = get();
      consecutiveErrors++;
      // Skip an unplayable track, unless several failed in a row: then something is wrong
      // with the server or the network, and skipping would run through the whole queue.
      if (index < queue.length - 1 && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
        get().playIndex(index + 1, true);
        set({ error: message });
      } else {
        consecutiveErrors = 0;
        engine?.stop();
        set({ status: 'stopped', position: 0, error: message });
      }
    },
  };
});

/** Id of the current track, or null. */
export const selectCurrentTrackId = (state: PlayerState): string | null =>
  state.index >= 0 ? (state.queue[state.index] ?? null) : null;
