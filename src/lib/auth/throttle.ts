/**
 * Slows down password guessing: after `maxFailures` failed logins for a key (client address +
 * username) within `windowMs`, further attempts are refused until the window ends.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; since: number }>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Seconds until `key` may try again, or 0 when it may now. */
  retryAfter(key: string): number {
    const entry = this.live(key);
    if (!entry || entry.count < this.maxFailures) return 0;
    return Math.ceil((entry.since + this.windowMs - this.now()) / 1000);
  }

  fail(key: string): void {
    const entry = this.live(key);
    if (entry) entry.count++;
    else this.failures.set(key, { count: 1, since: this.now() });
    if (this.failures.size > 10_000) this.prune();
  }

  succeed(key: string): void {
    this.failures.delete(key);
  }

  private live(key: string) {
    const entry = this.failures.get(key);
    if (entry && this.now() - entry.since >= this.windowMs) {
      this.failures.delete(key);
      return undefined;
    }
    return entry;
  }

  private prune(): void {
    for (const key of this.failures.keys()) this.live(key);
  }
}
