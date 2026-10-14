import {
  BLOCKED_MESSAGE,
  attachEngine,
  selectCurrentTrackId,
  usePlayerStore,
  type PlayerEngine,
} from './playerStore';

const initial = usePlayerStore.getState();

function fakeEngine() {
  const calls: string[] = [];
  const engine: PlayerEngine = {
    play: (id, at) => calls.push(`play ${id}@${at}`),
    cue: (id, at) => calls.push(`cue ${id}@${at}`),
    pause: () => calls.push('pause'),
    stop: () => calls.push('stop'),
    seek: (s) => calls.push(`seek ${s}`),
    setVolume: (v) => calls.push(`volume ${v}`),
    preload: (id) => calls.push(`preload ${id}`),
  };
  return { engine, calls };
}

let calls: string[];
let detach: () => void;
const player = () => usePlayerStore.getState();

beforeEach(() => {
  usePlayerStore.setState(initial, true);
  const fake = fakeEngine();
  calls = fake.calls;
  detach = attachEngine(fake.engine);
  calls.length = 0;
});

afterEach(() => detach());

describe('playerStore', () => {
  it('plays a new queue from a track and preloads the next one', () => {
    player().playQueue(['a', 'b', 'c'], 1);
    expect(player()).toMatchObject({ queue: ['a', 'b', 'c'], index: 1, status: 'loading' });
    expect(selectCurrentTrackId(player())).toBe('b');
    expect(calls).toEqual(['play b@0', 'preload c']);
  });

  it('follows the engine reports', () => {
    player().playQueue(['a'], 0);
    player().reportStatus('playing');
    player().reportTime(12, 180);
    expect(player()).toMatchObject({ status: 'playing', position: 12, duration: 180 });
    player().reportTime(1, Number.NaN);
    expect(player().duration).toBe(0);
  });

  it('pauses, resumes from the position, and toggles', () => {
    player().playQueue(['a', 'b'], 0);
    player().reportStatus('playing');
    player().reportTime(42, 100);
    player().toggle();
    expect(player().status).toBe('paused');
    player().toggle();
    expect(calls.slice(-2)).toEqual(['pause', 'play a@42']);
  });

  it('stops: rewinds and ignores the following "paused" report', () => {
    player().playQueue(['a'], 0);
    player().reportTime(30, 100);
    player().stop();
    player().reportStatus('paused');
    expect(player()).toMatchObject({ status: 'stopped', position: 0, index: 0 });
  });

  it('next keeps playing when playing, only moves when stopped', () => {
    player().playQueue(['a', 'b', 'c'], 0);
    player().reportStatus('playing');
    player().next();
    expect(player()).toMatchObject({ index: 1, status: 'loading' });
    player().stop();
    calls.length = 0;
    player().next();
    expect(player()).toMatchObject({ index: 2, status: 'stopped' });
    expect(calls[0]).toBe('cue c@0');
    player().next(); // Already last.
    expect(player().index).toBe(2);
  });

  it('previous restarts after 3 s, otherwise goes back', () => {
    player().playQueue(['a', 'b'], 1);
    player().reportStatus('playing');
    player().reportTime(10, 100);
    player().previous();
    expect(player()).toMatchObject({ index: 1, position: 0 });
    player().reportTime(2, 100);
    player().previous();
    expect(player()).toMatchObject({ index: 0, status: 'loading' });
    player().reportTime(1, 100);
    player().previous(); // First track: restart.
    expect(player()).toMatchObject({ index: 0, position: 0 });
  });

  it('moves on at the end of a track and stops after the last one', () => {
    player().playQueue(['a', 'b'], 0);
    player().reportEnded();
    expect(player()).toMatchObject({ index: 1, status: 'loading' });
    player().reportEnded();
    expect(player()).toMatchObject({ index: 1, status: 'stopped', position: 0 });
  });

  it('skips unplayable tracks and shows the error', () => {
    player().playQueue(['a', 'b'], 0);
    player().reportError('The track could not be decoded');
    expect(player()).toMatchObject({
      index: 1,
      status: 'loading',
      error: 'The track could not be decoded',
    });
    player().reportError('Network error');
    expect(player()).toMatchObject({ index: 1, status: 'stopped', error: 'Network error' });
  });

  it('stops skipping after several errors in a row', () => {
    player().playQueue(['a', 'b', 'c', 'd', 'e'], 0);
    player().reportError('Network error');
    player().reportError('Network error');
    expect(player()).toMatchObject({ index: 2, status: 'loading' });
    player().reportError('Network error');
    expect(player()).toMatchObject({ index: 2, status: 'stopped', error: 'Network error' });
  });

  it('counts only consecutive errors', () => {
    player().playQueue(['a', 'b', 'c', 'd', 'e'], 0);
    player().reportError('x');
    player().reportError('x');
    player().reportStatus('playing');
    player().reportError('x');
    player().reportError('x');
    expect(player()).toMatchObject({ index: 4, status: 'loading' });
  });

  it('clamps seeks to the track, just short of its end', () => {
    player().playQueue(['a'], 0);
    player().reportTime(0, 100);
    player().seek(500);
    expect(player().position).toBe(99.75);
    player().seek(-3);
    expect(player().position).toBe(0);
    expect(calls.slice(-2)).toEqual(['seek 99.75', 'seek 0']);
  });

  it('plays the first track when playing without a current one', () => {
    player().enqueue(['a', 'b']);
    expect(player().index).toBe(-1);
    player().play();
    expect(player()).toMatchObject({ index: 0, status: 'loading' });
  });

  it('inserts "play next" tracks after the current one', () => {
    player().playNext(['x']);
    expect(player().queue).toEqual(['x']);
    player().playQueue(['a', 'b', 'c'], 1);
    player().playNext(['x', 'y']);
    expect(player()).toMatchObject({ queue: ['a', 'b', 'x', 'y', 'c'], index: 1 });
  });

  it('removes queue entries, moving to the next track if the current one goes', () => {
    player().playQueue(['a', 'b', 'c', 'd'], 1);
    player().reportStatus('playing');
    calls.length = 0;
    player().removeFromQueue([0]);
    expect(player()).toMatchObject({ queue: ['b', 'c', 'd'], index: 0 });
    expect(calls).toEqual(['preload c']);

    player().removeFromQueue([0]);
    expect(player()).toMatchObject({ queue: ['c', 'd'], index: 0, status: 'loading' });
    expect(calls).toContain('play c@0');

    player().removeFromQueue([0, 1]);
    expect(player()).toMatchObject({ queue: [], index: -1, status: 'stopped' });
  });

  it('restores a saved queue, stopped at the saved position', () => {
    player().restore({ queue: ['a', 'b'], index: 1, position: 33, volume: 0.4 });
    expect(player()).toMatchObject({ index: 1, position: 33, status: 'stopped', volume: 0.4 });
    player().play();
    expect(calls.at(-1)).toBe('play b@33');
    player().restore({ queue: ['a'], index: 5, position: 3 });
    expect(player()).toMatchObject({ index: -1, position: 0 });
  });

  it('waits for an interaction when the browser blocks playback', () => {
    player().playQueue(['a', 'b'], 0);
    player().reportBlocked();
    expect(player()).toMatchObject({
      status: 'paused',
      resumePending: true,
      error: BLOCKED_MESSAGE,
    });
    player().play();
    expect(player()).toMatchObject({ status: 'loading', resumePending: false, error: null });
    player().reportBlocked();
    player().stop();
    expect(player().resumePending).toBe(false);
  });

  it('clamps the volume and applies it to the engine', () => {
    player().setVolume(1.5);
    player().setVolume(0.3);
    expect(player().volume).toBe(0.3);
    expect(calls).toEqual(['volume 1', 'volume 0.3']);
  });
});
