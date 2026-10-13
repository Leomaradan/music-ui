import type { DatabaseSync } from 'node:sqlite';

/** Small JSON values the app keeps for itself (`app_state` table), e.g. the playlist order. */
export class AppStateRepository {
  constructor(private readonly db: DatabaseSync) {}

  get<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT json FROM app_state WHERE key = ?').get(key) as
      | { json: string }
      | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.json) as T;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO app_state (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json',
      )
      .run(key, JSON.stringify(value));
  }
}
