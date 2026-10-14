import 'server-only';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '@/lib/db';
import { getEnv } from '@/lib/env';

// Route handlers, the proxy and instrumentation are bundled separately: share the connection
// through globalThis.
const DATABASE = Symbol.for('music-ui.database');
type Globals = typeof globalThis & { [DATABASE]?: DatabaseSync };

/** The app database (`DATA_DIR/music-ui.db`), opened and migrated on first use. */
export function getDatabase(): DatabaseSync {
  const globals = globalThis as Globals;
  globals[DATABASE] ??= openDatabase(join(getEnv().DATA_DIR, 'music-ui.db'));
  return globals[DATABASE];
}
