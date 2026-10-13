/**
 * Playback modes: how a selection of tracks (the table rows, a playlist…) becomes the play
 * queue. Pure functions; randomness comes from an injectable `rng` (Math.random by default).
 *
 * - Shuffle modes plan the whole queue at once: every track / album / artist once.
 * - Random modes are endless: the next track (or album) is drawn when the queue runs out,
 *   weighted by the history so the same track, album or artist does not come back too soon.
 */

export type PlaybackMode =
  | 'order'
  | 'shuffle'
  | 'random'
  | 'albumShuffle'
  | 'albumRandom'
  | 'artistShuffle'
  | 'artistRandom';

export const PLAYBACK_MODES: readonly { mode: PlaybackMode; label: string; description: string }[] =
  [
    { mode: 'order', label: 'In order', description: 'The selection as listed' },
    { mode: 'shuffle', label: 'Shuffle', description: 'Random order, each track once' },
    {
      mode: 'random',
      label: 'Random',
      description: 'Endless, avoids repeating tracks and artists too soon',
    },
    {
      mode: 'albumShuffle',
      label: 'Shuffle by album',
      description: 'Whole albums in random order, each album once',
    },
    {
      mode: 'albumRandom',
      label: 'Random by album',
      description: 'Endless whole albums, avoids repeating albums too soon',
    },
    {
      mode: 'artistShuffle',
      label: 'Shuffle by artist',
      description: 'One album per artist, artists in random order, each artist once',
    },
    {
      mode: 'artistRandom',
      label: 'Random by artist',
      description: 'Endless, one album per artist, avoids repeating artists too soon',
    },
  ];

export const isEndless = (mode: PlaybackMode) =>
  mode === 'random' || mode === 'albumRandom' || mode === 'artistRandom';

/** What the modes need to know about a track. */
export interface ModeTrack {
  id: string;
  /** Album id (a track without album is its own album). */
  albumKey: string;
  /** Album artist, lower-cased: what album / artist modes group by. */
  artistKey: string;
  /** Track artist, lower-cased: what "random" spreads out (compilations have many). */
  trackArtistKey: string;
  disc: number;
  track: number;
}

export function toModeTrack(track: {
  id: string;
  albumId: string | null;
  albumArtist: string;
  artist: string;
  disc: number | null;
  track: number | null;
}): ModeTrack {
  const own = `track:${track.id}`;
  return {
    id: track.id,
    albumKey: track.albumId ?? own,
    artistKey: (track.albumArtist || track.artist).toLowerCase() || own,
    trackArtistKey: (track.artist || track.albumArtist).toLowerCase() || own,
    disc: track.disc ?? 0,
    track: track.track ?? 0,
  };
}

export type Rng = () => number;

// ---- helpers -----------------------------------------------------------------------------

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** Index drawn with probability proportional to its weight (-1 if all weights are 0). */
export function weightedPick(weights: readonly number[], rng: Rng): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return weights.findLastIndex((w) => w > 0);
}

/** Groups by key, keeping the order of first appearance. */
function groupBy(tracks: readonly ModeTrack[], key: (t: ModeTrack) => string): ModeTrack[][] {
  const groups = new Map<string, ModeTrack[]>();
  for (const track of tracks) {
    const k = key(track);
    const group = groups.get(k);
    if (group) group.push(track);
    else groups.set(k, [track]);
  }
  return [...groups.values()];
}

/** An album's tracks in disc / track order (stable for equal numbers). */
function albumOrder(tracks: readonly ModeTrack[]): ModeTrack[] {
  return tracks.toSorted((a, b) => a.disc - b.disc || a.track - b.track);
}

const ids = (tracks: readonly ModeTrack[]) => tracks.map((t) => t.id);

/** The album of `start`, from `start` to its end (album order). */
function albumFrom(tracks: readonly ModeTrack[], start: ModeTrack): ModeTrack[] {
  const album = albumOrder(tracks.filter((t) => t.albumKey === start.albumKey));
  return album.slice(
    Math.max(
      0,
      album.findIndex((t) => t.id === start.id),
    ),
  );
}

/**
 * Repeat window: a unit (track, album, artist) played within the last `window` units is not
 * drawn again. Half the pool, capped, so small pools still have choices.
 */
const windowFor = (poolSize: number, cap: number) => Math.min(Math.floor(poolSize / 2), cap);

// ---- planning a queue ----------------------------------------------------------------------

export interface Plan {
  queue: string[];
  /** Where playback starts in `queue`. */
  index: number;
}

/**
 * Queue for a new selection. `start` is the index (in `tracks`) of the track to begin with,
 * or null (a playlist played as a whole). Endless modes return only the first unit; the
 * rest comes from `nextUnit`.
 */
export function planQueue(
  mode: PlaybackMode,
  tracks: readonly ModeTrack[],
  start: number | null,
  rng: Rng = Math.random,
): Plan {
  if (tracks.length === 0) return { queue: [], index: -1 };
  const first = start === null ? null : (tracks[start] ?? null);

  switch (mode) {
    case 'order':
      return { queue: ids(tracks), index: start ?? 0 };

    case 'shuffle': {
      if (!first) return { queue: ids(shuffled(tracks, rng)), index: 0 };
      const rest = tracks.filter((_, i) => i !== start);
      return { queue: [first.id, ...ids(shuffled(rest, rng))], index: 0 };
    }

    case 'albumShuffle': {
      const albums = shuffled(
        groupBy(tracks, (t) => t.albumKey),
        rng,
      );
      const head = first ? albumFrom(tracks, first) : [];
      const others = albums.filter((album) => album[0]!.albumKey !== first?.albumKey);
      return {
        queue: [...ids(head), ...others.flatMap((album) => ids(albumOrder(album)))],
        index: 0,
      };
    }

    case 'artistShuffle': {
      const artists = shuffled(
        groupBy(tracks, (t) => t.artistKey),
        rng,
      );
      const head = first ? albumFrom(tracks, first) : [];
      const queue = ids(head);
      for (const artist of artists) {
        if (artist[0]!.artistKey === first?.artistKey) continue;
        const albums = groupBy(artist, (t) => t.albumKey);
        const album = albums[Math.floor(rng() * albums.length)]!;
        queue.push(...ids(albumOrder(album)));
      }
      return { queue, index: 0 };
    }

    case 'random':
      return { queue: first ? [first.id] : nextUnit(mode, tracks, [], rng), index: 0 };

    case 'albumRandom':
    case 'artistRandom':
      return {
        queue: first ? ids(albumFrom(tracks, first)) : nextUnit(mode, tracks, [], rng),
        index: 0,
      };
  }
}

/**
 * Tracks to queue after the ones played or queued so far (`history`, oldest first), in an
 * endless mode: one track for "random", one album otherwise. Empty for finite modes.
 */
export function nextUnit(
  mode: PlaybackMode,
  tracks: readonly ModeTrack[],
  history: readonly string[],
  rng: Rng = Math.random,
): string[] {
  if (tracks.length === 0) return [];
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const past = history.flatMap((id) => byId.get(id) ?? []);
  switch (mode) {
    case 'random':
      return [pickTrack(tracks, past, rng).id];
    case 'albumRandom':
      return ids(albumOrder(pickAlbum(tracks, past, rng)));
    case 'artistRandom':
      return ids(albumOrder(pickArtistAlbum(tracks, past, rng)));
    default:
      return [];
  }
}

/** Keys of consecutive runs, most recent first: [A, A, B, A] → ['A', 'B', 'A']. */
function recentRuns(past: readonly ModeTrack[], key: (t: ModeTrack) => string): string[] {
  const runs: string[] = [];
  for (let i = past.length - 1; i >= 0; i--) {
    const k = key(past[i]!);
    if (runs.at(-1) !== k) runs.push(k);
  }
  return runs;
}

/** Distance (1 = most recent) of each key within the first `window` entries of `recent`. */
function distances(recent: readonly string[], window: number): Map<string, number> {
  const result = new Map<string, number>();
  recent.slice(0, window).forEach((key, i) => {
    if (!result.has(key)) result.set(key, i + 1);
  });
  return result;
}

/** 0.1 for the latest, rising to 1 outside the window. */
const recencyFactor = (distance: number | undefined, window: number) =>
  distance === undefined || window === 0 ? 1 : 0.1 + (0.9 * (distance - 1)) / window;

function counts(keys: Iterable<string>): Map<string, number> {
  const result = new Map<string, number>();
  for (const key of keys) result.set(key, (result.get(key) ?? 0) + 1);
  return result;
}

/**
 * Track weight: 0 if played within the repeat window, otherwise lower for tracks played
 * often and for artists heard recently.
 */
function pickTrack(tracks: readonly ModeTrack[], past: readonly ModeTrack[], rng: Rng): ModeTrack {
  const trackWindow = windowFor(tracks.length, 100);
  const recentIds = new Set(past.slice(-trackWindow).map((t) => t.id));
  const artistCount = new Set(tracks.map((t) => t.trackArtistKey)).size;
  const artistWindow = windowFor(artistCount, 10);
  const artistDistance = distances(
    past.toReversed().map((t) => t.trackArtistKey),
    artistWindow,
  );
  const plays = counts(past.map((t) => t.id));
  const weights = tracks.map((t) =>
    recentIds.has(t.id)
      ? 0
      : recencyFactor(artistDistance.get(t.trackArtistKey), artistWindow) /
        (1 + (plays.get(t.id) ?? 0)),
  );
  const picked = weightedPick(weights, rng);
  // Everything is "recent" (tiny pool): anything but the last track.
  if (picked === -1) {
    const others = tracks.filter((t) => t.id !== past.at(-1)?.id);
    return (others.length ? others : tracks)[Math.floor(rng() * (others.length || tracks.length))]!;
  }
  return tracks[picked]!;
}

function pickAlbum(
  tracks: readonly ModeTrack[],
  past: readonly ModeTrack[],
  rng: Rng,
): ModeTrack[] {
  const albums = groupBy(tracks, (t) => t.albumKey);
  const albumRuns = recentRuns(past, (t) => t.albumKey);
  const recentAlbums = new Set(albumRuns.slice(0, windowFor(albums.length, 20)));
  const artistCount = new Set(tracks.map((t) => t.artistKey)).size;
  const artistWindow = windowFor(artistCount, 5);
  const artistDistance = distances(
    recentRuns(past, (t) => t.artistKey),
    artistWindow,
  );
  const plays = counts(albumRuns);
  const weights = albums.map((album) => {
    const { albumKey, artistKey } = album[0]!;
    if (recentAlbums.has(albumKey)) return 0;
    return (
      recencyFactor(artistDistance.get(artistKey), artistWindow) / (1 + (plays.get(albumKey) ?? 0))
    );
  });
  const picked = weightedPick(weights, rng);
  if (picked !== -1) return albums[picked]!;
  const others = albums.filter((album) => album[0]!.albumKey !== albumRuns[0]);
  const pool = others.length ? others : albums;
  return pool[Math.floor(rng() * pool.length)]!;
}

function pickArtistAlbum(
  tracks: readonly ModeTrack[],
  past: readonly ModeTrack[],
  rng: Rng,
): ModeTrack[] {
  const artists = groupBy(tracks, (t) => t.artistKey);
  const artistRuns = recentRuns(past, (t) => t.artistKey);
  const recentArtists = new Set(artistRuns.slice(0, windowFor(artists.length, 10)));
  const artistPlays = counts(artistRuns);
  const weights = artists.map((artist) =>
    recentArtists.has(artist[0]!.artistKey)
      ? 0
      : 1 / (1 + (artistPlays.get(artist[0]!.artistKey) ?? 0)),
  );
  let picked = weightedPick(weights, rng);
  if (picked === -1) {
    const others = artists.findIndex((artist) => artist[0]!.artistKey !== artistRuns[0]);
    picked = others === -1 ? 0 : others;
  }
  // One album of that artist: the least played ones first, never the last one played if
  // there is a choice.
  const albums = groupBy(artists[picked]!, (t) => t.albumKey);
  const albumRuns = recentRuns(past, (t) => t.albumKey);
  const albumPlays = counts(albumRuns);
  const lastAlbum = albumRuns.find((key) => albums.some((album) => album[0]!.albumKey === key));
  const albumWeights = albums.map((album) =>
    albums.length > 1 && album[0]!.albumKey === lastAlbum
      ? 0
      : 1 / (1 + (albumPlays.get(album[0]!.albumKey) ?? 0)) ** 2,
  );
  return albums[Math.max(0, weightedPick(albumWeights, rng))]!;
}

// ---- changing mode during playback ---------------------------------------------------------

/**
 * Upcoming tracks after switching to `mode`, given what has been played (`history`, the
 * current track last). Finite modes continue with what has not been played yet; album and
 * artist modes first finish the current album.
 */
export function replanUpcoming(
  mode: PlaybackMode,
  tracks: readonly ModeTrack[],
  history: readonly string[],
  rng: Rng = Math.random,
): string[] {
  const current = history.at(-1);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const currentTrack = current === undefined ? undefined : byId.get(current);

  if (mode === 'order') {
    const position = current === undefined ? -1 : tracks.findIndex((t) => t.id === current);
    return ids(tracks.slice(position + 1));
  }

  const albumRest = (() => {
    if (!currentTrack || mode === 'shuffle' || mode === 'random') return [];
    return albumFrom(tracks, currentTrack).slice(1);
  })();

  if (mode === 'shuffle') {
    // Each track once: drop one occurrence per play.
    const played = counts(history);
    const rest = tracks.filter((t) => {
      const left = played.get(t.id) ?? 0;
      if (left === 0) return true;
      played.set(t.id, left - 1);
      return false;
    });
    return ids(shuffled(rest, rng));
  }

  if (mode === 'albumShuffle' || mode === 'artistShuffle') {
    const playedAlbums = new Set(history.flatMap((id) => byId.get(id)?.albumKey ?? []));
    const playedArtists = new Set(history.flatMap((id) => byId.get(id)?.artistKey ?? []));
    const rest = tracks.filter((t) =>
      mode === 'albumShuffle' ? !playedAlbums.has(t.albumKey) : !playedArtists.has(t.artistKey),
    );
    return [...ids(albumRest), ...planQueue(mode, rest, null, rng).queue];
  }

  // Endless modes: the rest comes from nextUnit when needed.
  return ids(albumRest);
}
