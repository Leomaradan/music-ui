import type { PlaybackStatus } from '@/client/stores/playerStore';
import { AudioEngine, type EngineReporter } from './engine';

/** Minimal HTMLAudioElement stand-in: jsdom does not play media. */
class FakeAudio extends EventTarget {
  src = '';
  preload = '';
  volume = 1;
  currentTime = 0;
  duration = Number.NaN;
  readyState = 0;
  ended = false;
  paused = true;
  error: { code: number } | null = null;
  loads = 0;
  playResult: Promise<void> = Promise.resolve();
  load() {
    this.loads++;
    this.readyState = 0;
  }
  play() {
    this.paused = false;
    return this.playResult;
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  /** Simulates the metadata arriving. */
  metadata(duration: number) {
    this.readyState = 1;
    this.duration = duration;
    this.dispatchEvent(new Event('loadedmetadata'));
  }
  emit(type: string) {
    this.dispatchEvent(new Event(type));
  }
}

function setup() {
  const elements: FakeAudio[] = [];
  const reports: string[] = [];
  const reporter: EngineReporter = {
    status: (status: PlaybackStatus) => reports.push(`status ${status}`),
    time: (position, duration) => reports.push(`time ${position}/${duration}`),
    ended: () => reports.push('ended'),
    error: (message) => reports.push(`error ${message}`),
  };
  const engine = new AudioEngine(reporter, () => {
    const element = new FakeAudio();
    elements.push(element);
    return element as unknown as HTMLAudioElement;
  });
  return { engine, reports, a: elements[0]!, b: elements[1]! };
}

describe('AudioEngine', () => {
  it('loads the stream URL and plays', () => {
    const { engine, reports, a } = setup();
    engine.play('track 1');
    expect(a.src).toBe('/api/stream/track%201');
    expect(a.paused).toBe(false);
    a.emit('playing');
    expect(reports).toEqual(['status loading', 'status playing']);
  });

  it('starts at a saved position once the metadata is known', () => {
    const { engine, a } = setup();
    engine.play('t1', 42);
    expect(a.currentTime).toBe(0);
    a.metadata(180);
    expect(a.currentTime).toBe(42);
  });

  it('does not reload the loaded track', () => {
    const { engine, a } = setup();
    engine.play('t1');
    a.metadata(100);
    engine.pause();
    engine.play('t1', 10);
    expect(a.loads).toBe(1);
    expect(a.currentTime).toBe(10);
  });

  it('preloads the next track in the spare element and swaps to it', () => {
    const { engine, reports, a, b } = setup();
    engine.play('t1');
    engine.preload('t2');
    expect(b.src).toBe('/api/stream/t2');
    expect(b.loads).toBe(1);

    engine.play('t2');
    expect(b.paused).toBe(false);
    expect(b.loads).toBe(1); // Not reloaded.
    expect(a.paused).toBe(true);

    // Only the current element reports.
    reports.length = 0;
    a.emit('playing');
    b.emit('playing');
    expect(reports).toEqual(['status playing']);
  });

  it('reports time, end and errors of the current element', () => {
    const { engine, reports, a } = setup();
    engine.play('t1');
    reports.length = 0;
    a.currentTime = 3;
    a.duration = 8;
    a.emit('timeupdate');
    a.ended = true;
    a.emit('pause'); // Fired at the end: not a user pause.
    a.emit('ended');
    a.error = { code: 4 };
    a.emit('error');
    expect(reports).toEqual([
      'time 3/8',
      'ended',
      'error The track is unavailable or its format is not supported',
    ]);
  });

  it('stops by pausing and rewinding', () => {
    const { engine, a } = setup();
    engine.play('t1');
    a.metadata(100);
    a.currentTime = 50;
    engine.stop();
    expect(a.paused).toBe(true);
    expect(a.currentTime).toBe(0);
  });

  it('reports a blocked autoplay', async () => {
    const { engine, reports, a } = setup();
    a.playResult = Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    engine.play('t1');
    await vi.waitFor(() => expect(reports).toContain('status paused'));
    expect(reports).toContain('error The browser blocked playback: press play to start.');
  });

  it('ignores a late rejection of an older play request', async () => {
    const { engine, reports, a } = setup();
    let rejectFirst: ((error: Error) => void) | undefined;
    a.playResult = new Promise((_, reject) => {
      rejectFirst = reject;
    });
    engine.play('t1');
    a.playResult = Promise.resolve();
    engine.play('t2'); // Same element, newer request.
    rejectFirst?.(Object.assign(new Error('gone'), { name: 'NotSupportedError' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reports.filter((r) => r.startsWith('error'))).toEqual([]);
  });

  it('sets the volume on both elements', () => {
    const { engine, a, b } = setup();
    engine.setVolume(0.5);
    expect([a.volume, b.volume]).toEqual([0.5, 0.5]);
  });
});
