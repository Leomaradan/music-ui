import { randomBytes } from 'node:crypto';
import { silentLogger, type Logger } from '@/lib/logger';
import type { SubsonicClient } from '@/lib/subsonic/client';
import { getLastModified, getMusicFolders, getScanStatus } from '@/lib/subsonic/endpoints';
import { fetchCatalog, type FetchProgress } from './fetch';
import { MetaKey, type CatalogRepository } from './repository';

export type SyncResult =
  | { result: 'synced'; version: string; trackCount: number }
  /** The server reports no change since the last sync. */
  | { result: 'unchanged' }
  /** The server is scanning its library: try again later. */
  | { result: 'deferred'; reason: string };

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error';
  progress: FetchProgress | null;
  /** Last successful sync (persisted). */
  lastSync: { at: string; version: string } | null;
  /** Last attempt, whatever its outcome (in memory). */
  lastRun: { at: string; result: SyncResult['result'] | 'error'; durationMs: number } | null;
  lastError: { at: string; message: string } | null;
  trackCount: number;
}

export interface CatalogSyncOptions {
  client: SubsonicClient;
  repository: CatalogRepository;
  logger?: Logger;
  pageSize?: number;
  now?: () => Date;
}

/**
 * Copies the library metadata from the Subsonic server into the local catalog (PLAN.md §5).
 * A sync is skipped when the server's change marker (folders, last scan, last modification)
 * is the same as at the last sync, unless forced. Only one sync runs at a time.
 */
export class CatalogSync {
  private running: Promise<SyncResult> | null = null;
  private progress: FetchProgress | null = null;
  private lastRun: SyncStatus['lastRun'] = null;
  private lastError: SyncStatus['lastError'] = null;
  private readonly logger: Logger;
  private readonly now: () => Date;

  constructor(private readonly options: CatalogSyncOptions) {
    this.logger = options.logger ?? silentLogger;
    this.now = options.now ?? (() => new Date());
  }

  /** Starts a sync, or joins the one already running. */
  sync({ force = false }: { force?: boolean } = {}): Promise<SyncResult> {
    this.running ??= this.run(force).finally(() => {
      this.running = null;
      this.progress = null;
    });
    return this.running;
  }

  get isRunning(): boolean {
    return this.running !== null;
  }

  status(): SyncStatus {
    const { repository } = this.options;
    const at = repository.getMeta(MetaKey.SyncedAt);
    const version = repository.getMeta(MetaKey.Version);
    return {
      state: this.running ? 'syncing' : this.lastRun?.result === 'error' ? 'error' : 'idle',
      progress: this.progress,
      lastSync: at && version ? { at, version } : null,
      lastRun: this.lastRun,
      lastError: this.lastError,
      trackCount: repository.trackCount(),
    };
  }

  private async run(force: boolean): Promise<SyncResult> {
    const { client, repository, pageSize } = this.options;
    const started = this.now();
    try {
      const [folders, scan, lastModified] = await Promise.all([
        getMusicFolders(client),
        getScanStatus(client),
        getLastModified(client),
      ]);
      const stamp = JSON.stringify({
        folders: folders.map(({ id, name }) => [id, name]),
        lastScan: scan.lastScan ?? null,
        lastModified,
      });

      let result: SyncResult;
      if (!force && scan.scanning) {
        result = { result: 'deferred', reason: 'the server is scanning its library' };
      } else if (!force && stamp === repository.getMeta(MetaKey.SourceStamp)) {
        result = { result: 'unchanged' };
      } else {
        const data = await fetchCatalog(client, {
          folders,
          pageSize,
          onProgress: (progress) => {
            this.progress = progress;
          },
        });
        const version = `${started.getTime().toString(36)}-${randomBytes(4).toString('hex')}`;
        repository.replace(data, {
          [MetaKey.Version]: version,
          [MetaKey.SyncedAt]: this.now().toISOString(),
          [MetaKey.SourceStamp]: stamp,
        });
        result = { result: 'synced', version, trackCount: data.tracks.length };
      }

      this.finish(started, result.result);
      this.lastError = null;
      if (result.result === 'synced') {
        this.logger.info(
          `catalog synced: ${result.trackCount} tracks in ${this.lastRun?.durationMs} ms`,
        );
      } else {
        this.logger.debug(`catalog sync ${result.result}`);
      }
      return result;
    } catch (error) {
      this.finish(started, 'error');
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = { at: this.now().toISOString(), message };
      this.logger.error(`catalog sync failed: ${message}`);
      throw error;
    }
  }

  private finish(started: Date, result: SyncResult['result'] | 'error'): void {
    const end = this.now();
    this.lastRun = {
      at: end.toISOString(),
      result,
      durationMs: end.getTime() - started.getTime(),
    };
  }
}
