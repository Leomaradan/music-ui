import type { CatalogSnapshot } from '@/lib/catalog/snapshot';
import type { DynamicPlaylist } from '@/lib/dynamicPlaylists/types';
import { decodeSnapshot, type Catalog, type Track } from '@/client/catalog/decode';
import { EMPTY_FILTERS } from '@/client/catalog/facets';
import { resetIdbConnection } from '@/client/storage/idb';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useDynamicPlaylistStore } from '@/client/stores/dynamicPlaylistStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { useNotificationStore } from '@/client/stores/notificationStore';
import { usePlayerStore } from '@/client/stores/playerStore';
import { usePlaylistStore } from '@/client/stores/playlistStore';
import { useSelectionStore } from '@/client/stores/selectionStore';
import { useUiStore } from '@/client/stores/uiStore';
import { useViewStore } from '@/client/stores/viewStore';
import snapshotJson from '../fixtures/catalog-snapshot.json';
import { FakeApi, type FakeApiOptions, type FakePlaylist } from './fake-api';

/**
 * Shared state for stories: the sample catalog (10 tracks in two libraries, from
 * tests/fixtures/catalog-snapshot.json), sample playlists and a per-story reset of the app.
 */
export const sampleSnapshot = snapshotJson as CatalogSnapshot;
export const sampleCatalog: Catalog = decodeSnapshot(sampleSnapshot);

export function trackByTitle(title: string): Track {
  const track = sampleCatalog.tracks.find((t) => t.title === title);
  if (!track) throw new Error(`No sample track titled "${title}"`);
  return track;
}

export const titleOf = (id: string) => sampleCatalog.tracks.find((t) => t.id === id)?.title;

export const samplePlaylists = (): FakePlaylist[] => [
  {
    id: 'p1',
    name: 'Road trip',
    trackIds: [trackByTitle('Dancing Queen').id, trackByTitle('Knowing Me, Knowing You').id],
  },
  { id: 'p2', name: 'Shared', readonly: true, trackIds: [trackByTitle('Walk This Way').id] },
];

/** One smart playlist: Rock before 1980 (Walk This Way, Sweet Emotion, Back in the Saddle). */
export const sampleDynamicPlaylists = (): DynamicPlaylist[] => [
  {
    id: 'd1',
    name: '70s rock',
    match: 'all',
    criteria: [
      { field: 'genre', op: '==', value: 'Rock' },
      { field: 'year', op: '<', value: 1980 },
    ],
  },
];

/** Story parameters read by the global `beforeEach` (.storybook/preview.tsx). */
export interface AppParameters {
  /** Fake API content. Defaults: the sample catalog and playlists. */
  fakeApi?: FakeApiOptions;
  /** Store the catalog as already loaded (default) or leave it loading. */
  catalog?: 'ready' | 'loading';
}

const initial = {
  catalog: useCatalogStore.getState(),
  filter: useFilterStore.getState(),
  view: useViewStore.getState(),
  selection: useSelectionStore.getState(),
  playlist: usePlaylistStore.getState(),
  dynamicPlaylist: useDynamicPlaylistStore.getState(),
  player: usePlayerStore.getState(),
  notification: useNotificationStore.getState(),
  ui: useUiStore.getState(),
};

let current: FakeApi | null = null;

/** The fake API of the running story. */
export function fakeApi(): FakeApi {
  if (!current) throw new Error('The fake API is installed by the global beforeEach');
  return current;
}

function deleteIdb(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase('music-ui');
    request.addEventListener('success', () => resolve());
    request.addEventListener('error', () => resolve());
    request.addEventListener('blocked', () => resolve());
  });
}

/**
 * Puts the app back in a known state before a story: stores, localStorage, the IndexedDB
 * catalog cache and a fresh fake API. Returns the cleanup.
 */
export async function resetApp(parameters: AppParameters = {}): Promise<() => void> {
  localStorage.clear();
  await resetIdbConnection();
  await deleteIdb();

  useCatalogStore.setState(initial.catalog, true);
  useFilterStore.setState({ ...initial.filter, filters: EMPTY_FILTERS, excluded: [] }, true);
  useViewStore.setState(initial.view, true);
  useSelectionStore.setState(initial.selection, true);
  usePlaylistStore.setState(initial.playlist, true);
  useDynamicPlaylistStore.setState(initial.dynamicPlaylist, true);
  usePlayerStore.setState(initial.player, true);
  useNotificationStore.setState(initial.notification, true);
  useUiStore.setState(initial.ui, true);
  if ((parameters.catalog ?? 'ready') === 'ready') {
    useCatalogStore.setState({ status: 'ready', catalog: sampleCatalog, error: null });
  }

  current = new FakeApi({
    snapshot: sampleSnapshot,
    playlists: samplePlaylists(),
    dynamicPlaylists: sampleDynamicPlaylists(),
    ...parameters.fakeApi,
  });
  const uninstall = current.install();
  return () => {
    uninstall();
    current = null;
  };
}
