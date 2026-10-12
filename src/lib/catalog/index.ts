import 'server-only';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { AppStateRepository } from '@/lib/appState';
import { openDatabase } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { getSubsonicClient } from '@/lib/subsonic';
import { MetaKey, CatalogRepository } from './repository';
import { buildSnapshot } from './snapshot';
import { CatalogSync } from './sync';

export { CatalogSync, type SyncResult, type SyncStatus } from './sync';
export type { CatalogSnapshot } from './snapshot';

export interface SerializedSnapshot {
  version: string;
  json: string;
  /** Compressed once per catalog version rather than on every request. */
  gzip: Buffer;
}

export interface CatalogService {
  repository: CatalogRepository;
  /** App-owned settings stored next to the catalog (playlist order…). */
  appState: AppStateRepository;
  sync: CatalogSync;
  /** Snapshot of the current catalog (JSON + gzip), or null before the first sync. */
  snapshot(): SerializedSnapshot | null;
}

export function createCatalogService(
  repository: CatalogRepository,
  sync: CatalogSync,
  appState: AppStateRepository,
): CatalogService {
  let cache: SerializedSnapshot | null = null;
  return {
    repository,
    appState,
    sync,
    snapshot() {
      const version = repository.getMeta(MetaKey.Version);
      if (!version) return null;
      if (cache?.version !== version) {
        const syncedAt = repository.getMeta(MetaKey.SyncedAt) ?? '';
        const json = JSON.stringify(buildSnapshot(repository.read(), version, syncedAt));
        cache = { version, json, gzip: gzipSync(json) };
      }
      return cache;
    },
  };
}

// Route handlers and instrumentation are bundled separately: share state through globalThis.
const SERVICE = Symbol.for('music-ui.catalog.service');
const SCHEDULER = Symbol.for('music-ui.catalog.scheduler');
type Globals = typeof globalThis & {
  [SERVICE]?: CatalogService;
  [SCHEDULER]?: NodeJS.Timeout | true;
};

export function getCatalogService(): CatalogService {
  const globals = globalThis as Globals;
  if (!globals[SERVICE]) {
    const env = getEnv();
    const db = openDatabase(join(env.DATA_DIR, 'music-ui.db'));
    const repository = new CatalogRepository(db);
    const sync = new CatalogSync({
      client: getSubsonicClient(),
      repository,
      logger: createLogger('catalog', env.LOG_LEVEL),
    });
    globals[SERVICE] = createCatalogService(repository, sync, new AppStateRepository(db));
  }
  return globals[SERVICE];
}

/**
 * Syncs at startup (a no-op when nothing changed), then checks for changes every
 * SYNC_INTERVAL_MINUTES (0 = manual only). Idempotent.
 */
export function startCatalogScheduler(): void {
  const globals = globalThis as Globals;
  if (globals[SCHEDULER]) return;
  const { sync } = getCatalogService();
  const minutes = getEnv().SYNC_INTERVAL_MINUTES;
  const tick = () => {
    sync.sync().catch(() => {
      // Already logged and exposed by sync.status(); retried at the next tick.
    });
  };
  tick();
  if (minutes > 0) {
    const timer = setInterval(tick, minutes * 60_000);
    timer.unref();
    globals[SCHEDULER] = timer;
  } else {
    globals[SCHEDULER] = true;
  }
}
