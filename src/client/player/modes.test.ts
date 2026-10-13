import {
  isEndless,
  nextUnit,
  planQueue,
  replanUpcoming,
  shuffled,
  weightedPick,
  type ModeTrack,
  type PlaybackMode,
} from './modes';

/** Deterministic random numbers (mulberry32). */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** artist a0..a5 with (i % 3) + 1 albums of 4 tracks; a5 is a compilation (many track artists). */
function library(): ModeTrack[] {
  const tracks: ModeTrack[] = [];
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < (a % 3) + 1; b++) {
      // Listed out of order on purpose: albums must play in track order.
      for (const n of [3, 1, 4, 2]) {
        tracks.push({
          id: `a${a}b${b}t${n}`,
          albumKey: `a${a}b${b}`,
          artistKey: `a${a}`,
          trackArtistKey: a === 5 ? `guest${n}` : `a${a}`,
          disc: 1,
          track: n,
        });
      }
    }
  }
  return tracks;
}

const tracks = library(); // 6 artists, 12 albums, 48 tracks
const byId = new Map(tracks.map((t) => [t.id, t]));
const album = (id: string) => byId.get(id)!.albumKey;
const artist = (id: string) => byId.get(id)!.artistKey;
/** Splits a queue into consecutive runs of the same key. */
const runs = (queue: string[], key: (id: string) => string) =>
  queue.reduce<string[][]>((acc, id) => {
    const last = acc.at(-1);
    if (last && key(last[0]!) === key(id)) last.push(id);
    else acc.push([id]);
    return acc;
  }, []);
const isAlbumOrder = (run: string[]) =>
  run.every((id, i) => i === 0 || byId.get(id)!.track > byId.get(run[i - 1]!)!.track);

describe('helpers', () => {
  it('shuffles without losing or duplicating items', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const result = shuffled(items, seeded(1));
    expect(result.toSorted((a, b) => a - b)).toEqual(items);
    expect(result).not.toEqual(items);
  });

  it('picks proportionally to the weights', () => {
    const rng = seeded(2);
    const hits = [0, 0, 0];
    for (let i = 0; i < 3000; i++) hits[weightedPick([1, 0, 3], rng)]!++;
    expect(hits[1]).toBe(0);
    expect(hits[2]! / hits[0]!).toBeGreaterThan(2.5);
    expect(hits[2]! / hits[0]!).toBeLessThan(3.5);
    expect(weightedPick([0, 0], rng)).toBe(-1);
  });
});

describe('planQueue', () => {
  it('in order: the selection as is, starting at the clicked track', () => {
    expect(planQueue('order', tracks, 5)).toEqual({ queue: tracks.map((t) => t.id), index: 5 });
    expect(planQueue('order', tracks, null).index).toBe(0);
  });

  it('shuffle: every track once, the clicked one first', () => {
    const { queue, index } = planQueue('shuffle', tracks, 7, seeded(3));
    expect(index).toBe(0);
    expect(queue[0]).toBe(tracks[7]!.id);
    expect(queue.toSorted()).toEqual(tracks.map((t) => t.id).toSorted());
    expect(queue).not.toEqual(tracks.map((t) => t.id));
  });

  it('shuffle by album: whole albums in track order, each once, the clicked one first', () => {
    const start = tracks.findIndex((t) => t.id === 'a1b1t2');
    const { queue } = planQueue('albumShuffle', tracks, start, seeded(4));
    const albums = runs(queue, album);
    expect(albums).toHaveLength(12);
    expect(new Set(albums.map((run) => album(run[0]!))).size).toBe(12);
    expect(albums[0]).toEqual(['a1b1t2', 'a1b1t3', 'a1b1t4']); // From the clicked track on.
    expect(albums.slice(1).every((run) => run.length === 4 && isAlbumOrder(run))).toBe(true);
  });

  it('shuffle by artist: one album per artist, each artist once', () => {
    const { queue } = planQueue('artistShuffle', tracks, null, seeded(5));
    const artists = runs(queue, artist);
    expect(artists).toHaveLength(6);
    expect(new Set(artists.map((run) => artist(run[0]!))).size).toBe(6);
    for (const run of artists) {
      expect(new Set(run.map(album)).size).toBe(1);
      expect(run).toHaveLength(4);
      expect(isAlbumOrder(run)).toBe(true);
    }
  });

  it('shuffle by artist: starts with the clicked track’s album, skips its artist afterwards', () => {
    const start = tracks.findIndex((t) => t.id === 'a2b2t1');
    const { queue } = planQueue('artistShuffle', tracks, start, seeded(6));
    expect(queue.slice(0, 4)).toEqual(['a2b2t1', 'a2b2t2', 'a2b2t3', 'a2b2t4']);
    expect(queue.slice(4).some((id) => artist(id) === 'a2')).toBe(false);
  });

  it.each<PlaybackMode>(['random', 'albumRandom', 'artistRandom'])(
    '%s starts with the clicked track (and its album)',
    (mode) => {
      const start = tracks.findIndex((t) => t.id === 'a4b1t3');
      const { queue } = planQueue(mode, tracks, start, seeded(7));
      expect(queue).toEqual(mode === 'random' ? ['a4b1t3'] : ['a4b1t3', 'a4b1t4']);
      expect(isEndless(mode)).toBe(true);
    },
  );

  it('handles empty selections', () => {
    expect(planQueue('shuffle', [], null)).toEqual({ queue: [], index: -1 });
    expect(nextUnit('random', [], [])).toEqual([]);
  });
});

/** Plays `steps` units of an endless mode and returns the history. */
function play(mode: PlaybackMode, steps: number, seed: number, pool = tracks) {
  const rng = seeded(seed);
  const history = [...planQueue(mode, pool, null, rng).queue];
  for (let i = 0; i < steps; i++) history.push(...nextUnit(mode, pool, history, rng));
  return history;
}

describe('random (endless)', () => {
  it('never repeats a track within half the pool', () => {
    const history = play('random', 400, 8);
    for (let i = 0; i < history.length; i++) {
      expect(history.slice(Math.max(0, i - 24), i)).not.toContain(history[i]);
    }
  });

  it('plays everything over time, without favorites', () => {
    const plays = new Map<string, number>();
    for (const id of play('random', 480, 9)) plays.set(id, (plays.get(id) ?? 0) + 1);
    // 481 plays of 48 tracks: about 10 each. Artists with many tracks are spread out, so
    // their tracks come a bit less often, but no track is starved or favored.
    expect(plays.size).toBe(48);
    expect(Math.min(...plays.values())).toBeGreaterThanOrEqual(5);
    expect(Math.max(...plays.values())).toBeLessThanOrEqual(20);
  });

  it('rarely plays the same artist twice in a row', () => {
    const history = play('random', 400, 10);
    const repeats = history.filter(
      (id, i) =>
        i > 0 && byId.get(history[i - 1]!)!.trackArtistKey === byId.get(id)!.trackArtistKey,
    );
    expect(repeats.length / history.length).toBeLessThan(0.05);
  });

  it('works with tiny pools', () => {
    expect(play('random', 5, 11, tracks.slice(0, 1))).toEqual(Array(6).fill(tracks[0]!.id));
    const two = play('random', 6, 12, tracks.slice(0, 2));
    expect(two.every((id, i) => i === 0 || id !== two[i - 1])).toBe(true);
  });
});

describe('random by album (endless)', () => {
  it('plays whole albums and does not repeat one within half the albums', () => {
    const albums = runs(play('albumRandom', 60, 13), album);
    for (const run of albums) {
      expect(run).toHaveLength(4);
      expect(isAlbumOrder(run)).toBe(true);
    }
    const keys = albums.map((run) => album(run[0]!));
    keys.forEach((key, i) => expect(keys.slice(Math.max(0, i - 6), i)).not.toContain(key));
  });
});

describe('random by artist (endless)', () => {
  it('plays one album per artist, artists not repeated within half the artists', () => {
    const history = play('artistRandom', 60, 14);
    const artists = runs(history, artist);
    for (const run of artists) expect(new Set(run.map(album)).size).toBe(1);
    const keys = artists.map((run) => artist(run[0]!));
    keys.forEach((key, i) => expect(keys.slice(Math.max(0, i - 3), i)).not.toContain(key));
  });

  it('rotates through an artist’s albums', () => {
    const history = play('artistRandom', 90, 15);
    const a2Albums = runs(history, album)
      .map((run) => album(run[0]!))
      .filter((key) => key.startsWith('a2'));
    expect(new Set(a2Albums).size).toBe(3);
    const repeatedInARow = a2Albums.filter((key, i) => i > 0 && key === a2Albums[i - 1]);
    expect(repeatedInARow).toEqual([]);
  });
});

describe('replanUpcoming', () => {
  const history = ['a0b0t1', 'a1b0t1', 'a1b0t2'];

  it('in order: continues after the current track in the selection', () => {
    // a1b0t2 is listed last of its album (3, 1, 4, 2): the next album follows.
    expect(replanUpcoming('order', tracks, history).slice(0, 2)).toEqual(['a1b1t3', 'a1b1t1']);
  });

  it('shuffle: the tracks not played yet', () => {
    const upcoming = replanUpcoming('shuffle', tracks, history, seeded(16));
    expect(upcoming).toHaveLength(45);
    expect(upcoming.some((id) => history.includes(id))).toBe(false);
  });

  it('album modes finish the current album first, then skip played albums / artists', () => {
    const albums = replanUpcoming('albumShuffle', tracks, history, seeded(17));
    expect(albums.slice(0, 2)).toEqual(['a1b0t3', 'a1b0t4']);
    expect(albums.slice(2).some((id) => album(id) === 'a0b0' || album(id) === 'a1b0')).toBe(false);

    const artists = replanUpcoming('artistShuffle', tracks, history, seeded(18));
    expect(artists.slice(0, 2)).toEqual(['a1b0t3', 'a1b0t4']);
    expect(artists.slice(2).some((id) => ['a0', 'a1'].includes(artist(id)))).toBe(false);

    expect(replanUpcoming('albumRandom', tracks, history)).toEqual(['a1b0t3', 'a1b0t4']);
    expect(replanUpcoming('random', tracks, history)).toEqual([]);
  });
});
