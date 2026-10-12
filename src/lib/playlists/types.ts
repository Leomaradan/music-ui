/** Playlist shapes exchanged between the API routes and the browser. */

/** A playlist as listed in the sidebar. */
export interface PlaylistSummary {
  id: string;
  name: string;
  songCount: number;
  /** Seconds. */
  duration: number;
  /** Not owned by the account: cannot be changed. */
  readonly: boolean;
  coverArt: string | null;
}

export interface PlaylistDetail extends PlaylistSummary {
  /** In playlist order (duplicates allowed). */
  trackIds: string[];
}
