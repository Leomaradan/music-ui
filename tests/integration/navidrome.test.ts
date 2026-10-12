// @vitest-environment node
/**
 * Runs against a real Navidrome seeded by `pnpm dev:navidrome` (see README).
 * Skipped unless SUBSONIC_TEST_URL is set.
 */
import { SubsonicClient } from '@/lib/subsonic/client';
import { getMusicFolders, getScanStatus, ping, search3 } from '@/lib/subsonic/endpoints';
import { SubsonicError } from '@/lib/subsonic/errors';

const url = process.env.SUBSONIC_TEST_URL ?? '';

describe.skipIf(!url)('Navidrome integration', () => {
  // The describe body runs even when skipped, so build clients lazily.
  const makeClient = (password = process.env.SUBSONIC_TEST_PASSWORD ?? 'music') =>
    new SubsonicClient({
      baseUrl: url,
      username: process.env.SUBSONIC_TEST_USER ?? 'music',
      password,
    });
  let client: SubsonicClient;
  beforeAll(() => {
    client = makeClient();
  });

  it('ping', async () => {
    expect(await ping(client)).toMatchObject({ type: 'navidrome', openSubsonic: true });
  });

  it('lists both libraries as music folders', async () => {
    const folders = await getMusicFolders(client);
    expect(folders.map((folder) => folder.name).sort()).toEqual(['Live', 'Main']);
  });

  it('search3 with an empty query is scoped by musicFolderId', async () => {
    const folders = await getMusicFolders(client);
    const counts: Record<string, number> = {};
    for (const folder of folders) {
      const { songs } = await search3(client, {
        songCount: 500,
        albumCount: 0,
        artistCount: 0,
        musicFolderId: folder.id,
      });
      counts[folder.name] = songs.length;
    }
    expect(counts).toEqual({ Main: 7, Live: 3 });

    const all = await search3(client, { songCount: 500, albumCount: 0, artistCount: 0 });
    expect(all.songs).toHaveLength(10);
  });

  it('getScanStatus', async () => {
    expect(await getScanStatus(client)).toMatchObject({ scanning: false, count: 10 });
  });

  it('rejects wrong credentials with code 40', async () => {
    const bad = makeClient('wrong');
    await expect(ping(bad)).rejects.toMatchObject({ kind: 'api', code: 40, httpStatus: 401 });
    await expect(ping(bad)).rejects.toBeInstanceOf(SubsonicError);
  });
});
