import 'server-only';
import { getEnv } from '@/lib/env';
import { SubsonicClient } from './client';

export * from './client';
export * from './endpoints';
export * from './errors';
export type {
  Album,
  Artist,
  MusicFolder,
  PlayQueue,
  Playlist,
  PlaylistWithSongs,
  ScanStatus,
  Song,
} from './schemas';

// Shared through globalThis: route handlers and instrumentation are bundled separately.
// Tests install their own client under this key.
const CLIENT = Symbol.for('music-ui.subsonic.client');
type Globals = typeof globalThis & { [CLIENT]?: SubsonicClient };

/** Shared client for the configured server and account (PLAN.md §4). */
export function getSubsonicClient(): SubsonicClient {
  const globals = globalThis as Globals;
  if (!globals[CLIENT]) {
    const env = getEnv();
    globals[CLIENT] = new SubsonicClient({
      baseUrl: env.SUBSONIC_URL,
      username: env.SUBSONIC_USER,
      password: env.SUBSONIC_PASSWORD,
      clientName: env.SUBSONIC_CLIENT_NAME,
      timeoutMs: env.SUBSONIC_TIMEOUT_MS,
    });
  }
  return globals[CLIENT];
}
