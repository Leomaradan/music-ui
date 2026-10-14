// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, transaction } from './db';

describe('openDatabase', () => {
  it('creates the schema and records the version', () => {
    const db = openDatabase(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual([
      'albums',
      'app_state',
      'folders',
      'meta',
      'sessions',
      'track_genres',
      'tracks',
      'users',
    ]);
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 });
  });

  it('creates the data directory and reopens an existing database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'music-ui-'));
    try {
      const path = join(dir, 'nested', 'music-ui.db');
      const first = openDatabase(path);
      first.prepare("INSERT INTO meta (key, value) VALUES ('k', 'v')").run();
      first.close();
      const second = openDatabase(path);
      expect(second.prepare("SELECT value FROM meta WHERE key = 'k'").get()).toEqual({
        value: 'v',
      });
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('transaction', () => {
  it('rolls back on error', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      transaction(db, () => {
        db.prepare("INSERT INTO meta (key, value) VALUES ('k', 'v')").run();
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.prepare('SELECT COUNT(*) AS n FROM meta').get()).toEqual({ n: 0 });
  });
});
