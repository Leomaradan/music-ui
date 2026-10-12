import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Schema migrations, applied in order. `PRAGMA user_version` stores how many ran.
 * Never edit a released migration: append a new one.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE folders (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE albums (
    id            TEXT PRIMARY KEY,
    folderId      INTEGER NOT NULL,
    name          TEXT NOT NULL,
    albumArtist   TEXT NOT NULL,
    albumArtistId TEXT,
    year          INTEGER,
    genre         TEXT,
    coverArt      TEXT,
    songCount     INTEGER NOT NULL,
    created       TEXT
  );
  CREATE TABLE tracks (
    id            TEXT PRIMARY KEY,
    folderId      INTEGER NOT NULL,
    albumId       TEXT,
    title         TEXT NOT NULL,
    artist        TEXT NOT NULL,
    artistId      TEXT,
    albumArtist   TEXT NOT NULL,
    albumArtistId TEXT,
    album         TEXT NOT NULL,
    year          INTEGER,
    track         INTEGER,
    disc          INTEGER,
    duration      INTEGER NOT NULL,
    bitRate       INTEGER,
    suffix        TEXT,
    size          INTEGER,
    coverArt      TEXT,
    path          TEXT
  );
  CREATE INDEX tracks_folder ON tracks(folderId);
  CREATE TABLE track_genres (
    trackId TEXT NOT NULL,
    genre   TEXT NOT NULL,
    PRIMARY KEY (trackId, genre)
  );
  CREATE INDEX track_genres_genre ON track_genres(genre);
  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE app_state (
    key  TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );
  `,
];

/** Opens (and migrates) the app database. Use `:memory:` in tests. */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  for (let version = current; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version] ?? '');
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

/** Runs `fn` in a write transaction (readers keep seeing the previous state until commit). */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
