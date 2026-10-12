import { EMPTY_FILTERS } from '@/client/catalog/facets';
import { useFilterStore } from './filterStore';
import { useSelectionStore } from './selectionStore';
import { useViewStore } from './viewStore';

beforeEach(() => {
  useFilterStore.setState({ filters: EMPTY_FILTERS, excluded: [] });
  useViewStore.setState({ activeView: 'filter' });
  useSelectionStore.getState().clear();
});

const state = () => useFilterStore.getState();

describe('filterStore', () => {
  it('clears the boxes after the one that changed', () => {
    state().setLevel('folders', [1]);
    state().setLevel('genres', ['Rock']);
    state().setLevel('artists', ['Aerosmith']);
    state().setLevel('albums', ['al1']);

    state().toggle('genres', 'Pop'); // Rock → Rock + Pop
    expect(state().filters).toEqual({
      folders: [1],
      genres: ['Rock', 'Pop'],
      artists: [],
      albums: [],
    });

    state().setLevel('artists', ['ABBA']);
    state().setLevel('folders', []);
    expect(state().filters).toEqual(EMPTY_FILTERS);
  });

  it('keeps the parent boxes', () => {
    state().setLevel('folders', [2]);
    state().setLevel('genres', ['Jazz']);
    state().setLevel('albums', ['al9']);
    expect(state().filters).toEqual({
      folders: [2],
      genres: ['Jazz'],
      artists: [],
      albums: ['al9'],
    });
  });

  it('toggles values in and out', () => {
    state().toggle('artists', 'ABBA');
    state().toggle('artists', 'Aerosmith');
    expect(state().filters.artists).toEqual(['ABBA', 'Aerosmith']);
    state().toggle('artists', 'ABBA');
    expect(state().filters.artists).toEqual(['Aerosmith']);
  });

  it('brings removed tracks back on any filter change', () => {
    state().exclude(['t1', 't2']);
    state().exclude(['t2', 't3']);
    expect(state().excluded).toEqual(['t1', 't2', 't3']);
    state().toggle('albums', 'al1');
    expect(state().excluded).toEqual([]);
  });

  it('switches to the filter results and drops the selection on change', () => {
    useViewStore.setState({ activeView: 'queue' });
    useSelectionStore.setState({ selection: { ids: new Set(['t1']), anchor: 't1' } });
    state().toggle('genres', 'Rock');
    expect(useViewStore.getState().activeView).toBe('filter');
    expect(useSelectionStore.getState().selection.ids.size).toBe(0);
  });

  it('restores removed tracks', () => {
    state().exclude(['t1']);
    state().restoreExcluded();
    expect(state().excluded).toEqual([]);
  });
});
