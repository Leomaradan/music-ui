import { accessSync, constants, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Makes sure DATA_DIR exists and is writable, or explains how to fix it. Without this, a
 * read-only appdata folder (a common Unraid permission issue) only shows up as HTTP 500s.
 */
export function checkDataDir(dir: string): string | null {
  const path = resolve(dir);
  try {
    mkdirSync(path, { recursive: true });
    accessSync(path, constants.R_OK | constants.W_OK);
    return null;
  } catch (error) {
    const reason = error instanceof Error && 'code' in error ? String(error.code) : String(error);
    const uid = typeof process.getuid === 'function' ? process.getuid() : '?';
    const gid = typeof process.getgid === 'function' ? process.getgid() : '?';
    return (
      `DATA_DIR "${path}" is not writable by this process (uid ${uid}, gid ${gid}): ${reason}.\n` +
      `Give it to that user, e.g. on Unraid: chown -R ${uid}:${gid} /mnt/user/appdata/music-ui`
    );
  }
}
