'use client';

import { notify } from '@/client/stores/notificationStore';
import { usePlayerStore } from '@/client/stores/playerStore';

const tracks = (n: number) => `${n} track${n === 1 ? '' : 's'}`;

/** Actions on chosen tracks, shared by the table menu and the mobile selection bar. */
export function playTracksNext(trackIds: string[]): void {
  if (trackIds.length === 0) return;
  usePlayerStore.getState().playNext(trackIds);
  notify(`${tracks(trackIds.length)} will play next`, 'success');
}

export function addTracksToQueue(trackIds: string[]): void {
  if (trackIds.length === 0) return;
  usePlayerStore.getState().enqueue(trackIds);
  notify(`Added ${tracks(trackIds.length)} to the queue`, 'success');
}
