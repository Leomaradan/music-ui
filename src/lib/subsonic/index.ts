import 'server-only';
import { getEnv } from '@/lib/env';
import { SubsonicClient } from './client';

export * from './client';
export * from './endpoints';
export * from './errors';
export type { Album, Artist, MusicFolder, ScanStatus, Song } from './schemas';

let client: SubsonicClient | undefined;

/** Shared client for the configured server and account (PLAN.md §4). */
export function getSubsonicClient(): SubsonicClient {
  if (!client) {
    const env = getEnv();
    client = new SubsonicClient({
      baseUrl: env.SUBSONIC_URL,
      username: env.SUBSONIC_USER,
      password: env.SUBSONIC_PASSWORD,
      clientName: env.SUBSONIC_CLIENT_NAME,
      timeoutMs: env.SUBSONIC_TIMEOUT_MS,
    });
  }
  return client;
}
