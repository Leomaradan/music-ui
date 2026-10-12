import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '@/lib/db';
import type { CatalogAlbum, CatalogData, CatalogFolder, CatalogTrack } from './model';

export const MetaKey = {
  /** Opaque id of the stored catalog, changes on every successful sync (snapshot ETag). */
  Version: 'catalogVersion',
  /** ISO date of the last successful sync. */
  SyncedAt: 'syncedAt',
  /** Server-side change marker seen at the last sync (see CatalogSync). */
  SourceStamp: 'sourceStamp',
} as const;

type TrackRow = Omit<CatalogTrack, 'genres'>;

/** Default track order: album artist, year, album, disc, track. */
const TRACK_ORDER = `albumArtist COLLATE NOCASE, year, album COLLATE NOCASE, albumId,
  disc, track, title COLLATE NOCASE`;

export class CatalogRepository {
  constructor(private readonly db: DatabaseSync) {}

  getMeta(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  trackCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM tracks').get() as { n: number };
    return row.n;
  }

  /** Replaces the whole catalog and its meta atomically. */
  replace(data: CatalogData, meta: Record<string, string>): void {
    transaction(this.db, () => {
      for (const table of ['folders', 'albums', 'tracks', 'track_genres']) {
        this.db.exec(`DELETE FROM ${table}`);
      }
      const insertFolder = this.db.prepare('INSERT INTO folders (id, name) VALUES ($id, $name)');
      for (const folder of data.folders) insertFolder.run({ ...folder });

      const insertAlbum = this.db.prepare(`INSERT OR REPLACE INTO albums
        (id, folderId, name, albumArtist, albumArtistId, year, genre, coverArt, songCount, created)
        VALUES ($id, $folderId, $name, $albumArtist, $albumArtistId, $year, $genre, $coverArt,
                $songCount, $created)`);
      for (const album of data.albums) insertAlbum.run({ ...album });

      const insertTrack = this.db.prepare(`INSERT OR REPLACE INTO tracks
        (id, folderId, albumId, title, artist, artistId, albumArtist, albumArtistId, album, year,
         track, disc, duration, bitRate, suffix, size, coverArt, path)
        VALUES ($id, $folderId, $albumId, $title, $artist, $artistId, $albumArtist,
                $albumArtistId, $album, $year, $track, $disc, $duration, $bitRate, $suffix,
                $size, $coverArt, $path)`);
      const insertGenre = this.db.prepare(
        'INSERT OR IGNORE INTO track_genres (trackId, genre) VALUES (?, ?)',
      );
      for (const { genres, ...track } of data.tracks) {
        insertTrack.run({ ...track });
        for (const genre of genres) insertGenre.run(track.id, genre);
      }

      for (const [key, value] of Object.entries(meta)) this.setMeta(key, value);
    });
  }

  /** Reads the whole catalog, tracks in default display order. */
  read(): CatalogData {
    const folders = this.db
      .prepare('SELECT id, name FROM folders ORDER BY id')
      .all() as unknown as CatalogFolder[];
    const albums = this.db
      .prepare(
        `SELECT * FROM albums ORDER BY albumArtist COLLATE NOCASE, year, name COLLATE NOCASE`,
      )
      .all() as unknown as CatalogAlbum[];
    const rows = this.db
      .prepare(`SELECT * FROM tracks ORDER BY ${TRACK_ORDER}`)
      .all() as unknown as TrackRow[];

    const genresByTrack = new Map<string, string[]>();
    const genreRows = this.db
      .prepare('SELECT trackId, genre FROM track_genres ORDER BY rowid')
      .all() as unknown as { trackId: string; genre: string }[];
    for (const { trackId, genre } of genreRows) {
      const list = genresByTrack.get(trackId);
      if (list) list.push(genre);
      else genresByTrack.set(trackId, [genre]);
    }

    const tracks = rows.map((row) =>
      Object.assign(row, { genres: genresByTrack.get(row.id) ?? [] }),
    );
    return { folders, albums, tracks };
  }
}
