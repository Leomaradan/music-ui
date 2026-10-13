import { sampleCatalog } from '../../../tests/helpers/catalog';
import type { Catalog } from '@/client/catalog/decode';
import { useCatalogStore } from './catalogStore';
import {
  attachEngine,
  selectCurrentTrackId,
  usePlayerStore,
  type PlayerEngine,
} from './playerStore';

const initial = usePlayerStore.getState();
const player = () => usePlayerStore.getState();
const noop = () => {};
const engine: PlayerEngine = {
  play: noop,
  cue: noop,
  pause: noop,
  stop: noop,
  seek: noop,
  setVolume: noop,
  preload: noop,
};

let catalog: Catalog;
let ids: string[];
let detach: () => void;
const albumOf = (id: string) => catalog.tracks.find((t) => t.id === id)?.album;
const artistOf = (id: string) => catalog.tracks.find((t) => t.id === id)?.albumArtist;

beforeAll(async () => {
  catalog = await sampleCatalog();
  ids = catalog.tracks.map((t) => t.id);
});

beforeEach(() => {
  useCatalogStore.setState({ catalog, status: 'ready' });
  usePlayerStore.setState(initial, true);
  detach = attachEngine(engine);
});
afterEach(() => detach());

describe('playback modes in the player', () => {
  it('in order (default) plays the selection as listed from the picked track', () => {
    player().playSelection(ids, 3);
    expect(player()).toMatchObject({ mode: 'order', queue: ids, index: 3, selection: ids });
  });

  it('shuffle plays the picked track first, then every other track once', () => {
    player().setMode('shuffle');
    player().playSelection(ids, 4);
    expect(player().index).toBe(0);
    expect(selectCurrentTrackId(player())).toBe(ids[4]);
    expect(player().queue.toSorted()).toEqual(ids.toSorted());
  });

  it('a playlist (no picked track) starts wherever the mode chooses', () => {
    player().setMode('albumShuffle');
    player().playSelection(ids, null);
    const albums = player().queue.map(albumOf);
    // Albums come whole: each album appears in one block.
    const blocks = albums.filter((a, i) => i === 0 || a !== albums[i - 1]);
    expect(new Set(blocks).size).toBe(blocks.length);
    expect(blocks).toHaveLength(6);
  });

  it('random keeps one track ahead, so Next and preloading always work', () => {
    player().setMode('random');
    player().playSelection(ids, 0);
    expect(player().queue).toHaveLength(2);
    for (let i = 0; i < 10; i++) player().next();
    expect(player().index).toBe(10);
    player().reportStatus('playing');
    for (let i = 0; i < 10; i++) player().reportEnded();
    expect(player().index).toBe(20);
    expect(player().queue).toHaveLength(22);
    // No track twice within 5 (half of the 10 tracks).
    const queue = player().queue;
    queue.forEach((id, i) => expect(queue.slice(Math.max(0, i - 5), i)).not.toContain(id));
  });

  it('random by artist plays one album, then another artist', () => {
    player().setMode('artistRandom');
    player().playSelection(
      ids,
      ids.findIndex((id) => albumOf(id) === 'Arrival'),
    );
    for (let i = 0; i < 6; i++) player().reportEnded();
    const queue = player().queue;
    expect(queue.slice(0, 2).map(albumOf)).toEqual(['Arrival', 'Arrival']);
    const artists = queue.map(artistOf).filter((a, i, all) => i === 0 || a !== all[i - 1]);
    expect(artists.filter((a, i) => i > 0 && a === artists[i - 1])).toEqual([]);
  });

  it('changing mode while playing keeps the history and re-plans what comes next', () => {
    player().playSelection(ids, 0);
    player().reportStatus('playing');
    player().reportEnded();
    player().reportEnded();
    const history = player().queue.slice(0, 3);
    player().setMode('shuffle');
    expect(player().queue.slice(0, 3)).toEqual(history);
    expect(player().index).toBe(2);
    expect(player().queue).toHaveLength(10);
    expect(
      player()
        .queue.slice(3)
        .some((id) => history.includes(id)),
    ).toBe(false);

    player().setMode('order');
    expect(player().queue).toEqual([...history, ...ids.slice(ids.indexOf(history[2]!) + 1)]);
  });

  it('only sets the mode when nothing is playing', () => {
    player().setMode('random');
    expect(player()).toMatchObject({ mode: 'random', queue: [], index: -1 });
  });
});
