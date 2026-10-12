// @vitest-environment node
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDataDir } from './dataDir';

describe('checkDataDir', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'music-ui-data-'));
  });
  afterEach(() => {
    chmodSync(root, 0o755);
    rmSync(root, { recursive: true, force: true });
  });

  it('creates a missing directory', () => {
    expect(checkDataDir(join(root, 'a', 'b'))).toBeNull();
  });

  it('explains a non-writable directory', (context) => {
    // Root can write anywhere: only meaningful as a regular user (as in CI).
    if (process.getuid?.() === 0) context.skip();
    chmodSync(root, 0o555);
    expect(checkDataDir(root)).toMatch(
      /is not writable by this process \(uid \d+, gid \d+\): EACCES/,
    );
  });
});
