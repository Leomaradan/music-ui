'use client';

import { useMemo } from 'react';
import type { Track } from '@/client/catalog/decode';
import { getFacets, type Facets } from '@/client/catalog/facets';
import { tracksById, unknownTrack } from '@/client/catalog/lookup';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { selectCurrentTrackId, usePlayerStore } from '@/client/stores/playerStore';
import { useViewStore } from '@/client/stores/viewStore';

const NO_TRACKS: Track[] = [];

/** Filter box options and the tracks matching the filters (null until the catalog loads). */
export function useFacets(): Facets | null {
  const catalog = useCatalogStore((state) => state.catalog);
  const filters = useFilterStore((state) => state.filters);
  return catalog ? getFacets(catalog, filters) : null;
}

/** Tracks of the play queue, in queue order (placeholders for tracks no longer in the library). */
export function useQueueTracks(): Track[] {
  const catalog = useCatalogStore((state) => state.catalog);
  const queue = usePlayerStore((state) => state.queue);
  return useMemo(() => {
    if (!catalog || queue.length === 0) return NO_TRACKS;
    const byId = tracksById(catalog);
    return queue.map((id) => byId.get(id) ?? unknownTrack(id));
  }, [catalog, queue]);
}

/** Tracks listed by the table for the active sidebar entry, before sorting. */
export function useTableTracks(): Track[] {
  const facets = useFacets();
  const queueTracks = useQueueTracks();
  const excluded = useFilterStore((state) => state.excluded);
  const view = useViewStore((state) => state.activeView);
  return useMemo(() => {
    if (view === 'queue') return queueTracks;
    if (!facets) return NO_TRACKS;
    if (excluded.length === 0) return facets.tracks;
    const hidden = new Set(excluded);
    return facets.tracks.filter((track) => !hidden.has(track.id));
  }, [facets, queueTracks, excluded, view]);
}

/** The track being played (or paused), if any. */
export function useCurrentTrack(): Track | null {
  const catalog = useCatalogStore((state) => state.catalog);
  const id = usePlayerStore(selectCurrentTrackId);
  if (!id) return null;
  return (catalog && tracksById(catalog).get(id)) || unknownTrack(id);
}
