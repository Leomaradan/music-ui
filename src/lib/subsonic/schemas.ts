import { z } from 'zod';

/**
 * Zod schemas for the parts of Subsonic responses the app uses.
 * Objects are loose: unknown fields (OpenSubsonic extras, server specifics) are kept, not rejected.
 * Shapes checked against Navidrome 0.64 responses (tests/fixtures/navidrome).
 */

const nameRef = z.looseObject({ name: z.string() });
const idNameRef = z.looseObject({ id: z.string(), name: z.string() });

export const envelopeSchema = z.looseObject({
  status: z.enum(['ok', 'failed']),
  version: z.string(),
  /** Server implementation, e.g. "navidrome" (OpenSubsonic). */
  type: z.string().optional(),
  serverVersion: z.string().optional(),
  openSubsonic: z.boolean().optional(),
  error: z.looseObject({ code: z.number(), message: z.string().optional() }).optional(),
});
export type SubsonicEnvelope = z.infer<typeof envelopeSchema>;

export const musicFolderSchema = z.looseObject({
  id: z.number(),
  name: z.string().default(''),
});
export type MusicFolder = z.infer<typeof musicFolderSchema>;

export const musicFoldersSchema = z.looseObject({
  musicFolder: z.array(musicFolderSchema).default([]),
});

export const scanStatusSchema = z.looseObject({
  scanning: z.boolean(),
  count: z.number().optional(),
  /** ISO date of the last scan (Navidrome / OpenSubsonic). */
  lastScan: z.string().optional(),
});
export type ScanStatus = z.infer<typeof scanStatusSchema>;

export const indexesSchema = z.looseObject({
  /** Epoch milliseconds of the last library change. */
  lastModified: z.number(),
});

/** A song ("Child" in the Subsonic spec). */
export const songSchema = z.looseObject({
  id: z.string(),
  title: z.string().default(''),
  isDir: z.boolean().optional(),
  album: z.string().optional(),
  albumId: z.string().optional(),
  artist: z.string().optional(),
  artistId: z.string().optional(),
  track: z.number().optional(),
  discNumber: z.number().optional(),
  year: z.number().optional(),
  genre: z.string().optional(),
  duration: z.number().optional(),
  bitRate: z.number().optional(),
  size: z.number().optional(),
  suffix: z.string().optional(),
  contentType: z.string().optional(),
  coverArt: z.string().optional(),
  path: z.string().optional(),
  // OpenSubsonic
  genres: z.array(nameRef).optional(),
  albumArtists: z.array(idNameRef).optional(),
  displayAlbumArtist: z.string().optional(),
});
export type Song = z.infer<typeof songSchema>;

/** An album in ID3 mode ("AlbumID3" in the Subsonic spec). */
export const albumSchema = z.looseObject({
  id: z.string(),
  name: z.string().default(''),
  artist: z.string().optional(),
  artistId: z.string().optional(),
  coverArt: z.string().optional(),
  songCount: z.number().default(0),
  duration: z.number().default(0),
  created: z.string().optional(),
  year: z.number().optional(),
  genre: z.string().optional(),
  // OpenSubsonic
  genres: z.array(nameRef).optional(),
  isCompilation: z.boolean().optional(),
});
export type Album = z.infer<typeof albumSchema>;

export const artistSchema = z.looseObject({
  id: z.string(),
  name: z.string().default(''),
  albumCount: z.number().optional(),
  coverArt: z.string().optional(),
});
export type Artist = z.infer<typeof artistSchema>;

export const searchResult3Schema = z.looseObject({
  artist: z.array(artistSchema).default([]),
  album: z.array(albumSchema).default([]),
  song: z.array(songSchema).default([]),
});

export const albumList2Schema = z.looseObject({
  album: z.array(albumSchema).default([]),
});

export const playQueueSchema = z.looseObject({
  entry: z.array(songSchema).default([]),
  /** Id of the current track. */
  current: z.string().optional(),
  /** Position in the current track, in milliseconds. */
  position: z.number().optional(),
  changed: z.string().optional(),
});
export type PlayQueue = z.infer<typeof playQueueSchema>;

export const playlistSchema = z.looseObject({
  id: z.string(),
  name: z.string().default(''),
  songCount: z.number().default(0),
  /** Seconds. */
  duration: z.number().default(0),
  owner: z.string().optional(),
  public: z.boolean().optional(),
  /** OpenSubsonic: the user cannot modify it (e.g. owned by someone else). */
  readonly: z.boolean().optional(),
  coverArt: z.string().optional(),
  created: z.string().optional(),
  changed: z.string().optional(),
});
export type Playlist = z.infer<typeof playlistSchema>;

export const playlistsSchema = z.looseObject({
  playlist: z.array(playlistSchema).default([]),
});

export const playlistWithSongsSchema = playlistSchema.extend({
  entry: z.array(songSchema).default([]),
});
export type PlaylistWithSongs = z.infer<typeof playlistWithSongsSchema>;
