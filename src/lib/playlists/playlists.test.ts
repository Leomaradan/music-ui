// @vitest-environment node
import type { Playlist } from '@/lib/subsonic';
import { sortPlaylists } from './index';

const pl = (id: string, created: string): Playlist => ({
  id,
  name: id,
  songCount: 0,
  duration: 0,
  created,
});

describe('sortPlaylists', () => {
  it('follows the saved order, then the oldest unknown playlists', () => {
    const playlists = [
      pl('a', '2026-01-03'),
      pl('b', '2026-01-01'),
      pl('c', '2026-01-02'),
      pl('d', '2026-01-04'),
    ];
    expect(sortPlaylists(playlists, ['d', 'a', 'gone']).map((p) => p.id)).toEqual([
      'd',
      'a',
      'b',
      'c',
    ]);
    expect(sortPlaylists(playlists, []).map((p) => p.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});
