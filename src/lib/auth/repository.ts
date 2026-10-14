import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface Session {
  username: string;
  /** ISO date. */
  expires: string;
}

const DAY_MS = 86_400_000;

/** Only a hash of the token is stored: a leaked database does not give working sessions. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** UI accounts and login sessions (`users` and `sessions` tables). */
export class AuthRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  userCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }

  /** The user's canonical name and password hash (names are case-insensitive). */
  findUser(username: string): { username: string; passwordHash: string } | undefined {
    return this.db
      .prepare('SELECT username, passwordHash FROM users WHERE username = ?')
      .get(username) as { username: string; passwordHash: string } | undefined;
  }

  /** Creates a session and returns its token (only for the cookie: it is not stored). */
  createSession(username: string, days: number): { token: string; expires: string } {
    const token = randomBytes(32).toString('base64url');
    const now = this.now();
    const expires = new Date(now.getTime() + days * DAY_MS).toISOString();
    this.db
      .prepare('INSERT INTO sessions (tokenHash, username, created, expires) VALUES (?, ?, ?, ?)')
      .run(hashToken(token), username, now.toISOString(), expires);
    return { token, expires };
  }

  /**
   * The live session of a token, or null. Sliding expiry: once half of its lifetime has
   * passed, the session is extended to `days` from now (`renewed` tells the caller to
   * refresh the cookie).
   */
  getSession(token: string, days: number): (Session & { renewed: boolean }) | null {
    const tokenHash = hashToken(token);
    const row = this.db
      .prepare('SELECT username, expires FROM sessions WHERE tokenHash = ?')
      .get(tokenHash) as Session | undefined;
    if (!row) return null;
    const now = this.now().getTime();
    const expires = Date.parse(row.expires);
    // An unreadable date counts as expired.
    if (Number.isNaN(expires) || expires <= now) {
      this.db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(tokenHash);
      return null;
    }
    if (expires - now > (days * DAY_MS) / 2) return { ...row, renewed: false };
    const renewed = new Date(now + days * DAY_MS).toISOString();
    this.db.prepare('UPDATE sessions SET expires = ? WHERE tokenHash = ?').run(renewed, tokenHash);
    return { username: row.username, expires: renewed, renewed: true };
  }

  deleteSession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(hashToken(token));
  }

  deleteExpiredSessions(): void {
    this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(this.now().toISOString());
  }
}
