'use client';

import { useMemo } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { Theme } from '@mui/material/styles';
import type { Track } from '@/client/catalog/decode';
import { matchTracks } from '@/client/catalog/dynamic';
import { getFacets, type Facets } from '@/client/catalog/facets';
import { tracksById, unknownTrack } from '@/client/catalog/lookup';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useDynamicPlaylistStore } from '@/client/stores/dynamicPlaylistStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { selectCurrentTrackId, usePlayerStore } from '@/client/stores/playerStore';
import { usePlaylistStore } from '@/client/stores/playlistStore';
import { dynamicOfView, playlistOfView, useViewStore } from '@/client/stores/viewStore';

const NO_TRACKS: Track[] = [];

/** Filter box options and the tracks matching the filters (null until the catalog loads). */
export function useFacets(): Facets | null {
  const catalog = useCatalogStore((state) => state.catalog);
  const filters = useFilterStore((state) => state.filters);
  return catalog ? getFacets(catalog, filters) : null;
}

/** Tracks for a list of ids, in order (placeholders for tracks no longer in the library). */
function useTracksOf(ids: readonly string[] | undefined): Track[] {
  const catalog = useCatalogStore((state) => state.catalog);
  return useMemo(() => {
    if (!catalog || !ids || ids.length === 0) return NO_TRACKS;
    const byId = tracksById(catalog);
    return ids.map((id) => byId.get(id) ?? unknownTrack(id));
  }, [catalog, ids]);
}

/** Tracks of the play queue, in queue order. */
export function useQueueTracks(): Track[] {
  return useTracksOf(usePlayerStore((state) => state.queue));
}

/** Tracks of the playlist shown in the table (empty until loaded). */
function usePlaylistTracks(playlistId: string | null): Track[] {
  return useTracksOf(
    usePlaylistStore((state) => (playlistId ? state.tracks[playlistId] : undefined)),
  );
}

/** Tracks matching a dynamic playlist, recomputed when the catalog or the criteria change. */
export function useDynamicTracks(id: string | null): Track[] {
  const catalog = useCatalogStore((state) => state.catalog);
  const playlist = useDynamicPlaylistStore((state) =>
    id ? state.playlists.find((p) => p.id === id) : undefined,
  );
  return useMemo(
    () => (catalog && playlist ? matchTracks(catalog.tracks, playlist) : NO_TRACKS),
    [catalog, playlist],
  );
}

/** Tracks listed by the table for the active sidebar entry, before sorting. */
export function useTableTracks(): Track[] {
  const facets = useFacets();
  const queueTracks = useQueueTracks();
  const excluded = useFilterStore((state) => state.excluded);
  const view = useViewStore((state) => state.activeView);
  const playlistTracks = usePlaylistTracks(playlistOfView(view));
  const dynamicTracks = useDynamicTracks(dynamicOfView(view));
  return useMemo(() => {
    if (view === 'queue') return queueTracks;
    if (playlistOfView(view)) return playlistTracks;
    if (dynamicOfView(view)) return dynamicTracks;
    if (!facets) return NO_TRACKS;
    if (excluded.length === 0) return facets.tracks;
    const hidden = new Set(excluded);
    return facets.tracks.filter((track) => !hidden.has(track.id));
  }, [facets, queueTracks, playlistTracks, dynamicTracks, excluded, view]);
}

/**
 * Phone-sized screen (below MUI's `md` breakpoint, 900 px): one column, the sidebar in a drawer,
 * the filters in a dialog, no drag and drop. False during server rendering and the first
 * client render, so they match.
 */
export function useIsMobile(): boolean {
  return useMediaQuery((theme: Theme) => theme.breakpoints.down('md'));
}

/** The track being played (or paused), if any. */
export function useCurrentTrack(): Track | null {
  const catalog = useCatalogStore((state) => state.catalog);
  const id = usePlayerStore(selectCurrentTrackId);
  if (!id) return null;
  return (catalog && tracksById(catalog).get(id)) || unknownTrack(id);
}
