import type { PlaybackStatus, PlayerEngine } from '@/client/stores/playerStore';

export interface EngineReporter {
  status(status: PlaybackStatus): void;
  time(position: number, duration: number): void;
  ended(): void;
  error(message: string): void;
  /** The browser refused to start playback without a user gesture (autoplay policy). */
  blocked(): void;
}

export const streamUrl = (trackId: string) => `/api/stream/${encodeURIComponent(trackId)}`;

const MEDIA_ERRORS: Record<number, string> = {
  1: 'Playback aborted',
  2: 'Network error while loading the track',
  3: 'The track could not be decoded',
  4: 'The track is unavailable or its format is not supported',
};

/**
 * HTML audio playback with two elements: the "current" one plays, the "spare" one preloads
 * the next track; when that track is asked for, the elements swap so it starts at once.
 */
export class AudioEngine implements PlayerEngine {
  private current: HTMLAudioElement;
  private spare: HTMLAudioElement;
  private loadedId: string | null = null;
  private spareId: string | null = null;
  /** Seek to apply once the loaded track's metadata is known. */
  private pendingStart: number | null = null;
  /**
   * Incremented on every play request. The two elements take turns being "current", so a
   * play() promise of an older request can reject after its element became current again:
   * only the latest request may report.
   */
  private playRequest = 0;
  private readonly detachers: (() => void)[] = [];

  constructor(
    private readonly reporter: EngineReporter,
    createAudio: () => HTMLAudioElement = () => new Audio(),
  ) {
    this.current = createAudio();
    this.spare = createAudio();
    for (const element of [this.current, this.spare]) {
      element.preload = 'auto';
      this.listen(element);
    }
  }

  play(trackId: string, startAt?: number): void {
    this.load(trackId, startAt);
    this.reporter.status('loading');
    const request = ++this.playRequest;
    this.current.play().catch((error: unknown) => {
      if (request !== this.playRequest) return;
      const name = error instanceof Error ? error.name : '';
      if (name === 'AbortError') return; // Superseded by another load.
      if (name === 'NotAllowedError') {
        this.reporter.blocked();
      } else {
        this.reporter.status('paused');
        this.reporter.error(error instanceof Error ? error.message : 'Playback failed');
      }
    });
  }

  cue(trackId: string, startAt?: number): void {
    this.playRequest++;
    this.current.pause();
    this.load(trackId, startAt);
  }

  pause(): void {
    this.current.pause();
  }

  stop(): void {
    this.playRequest++;
    this.current.pause();
    this.pendingStart = null;
    if (this.loadedId !== null && this.current.readyState > 0) this.current.currentTime = 0;
  }

  seek(seconds: number): void {
    if (this.loadedId === null) return;
    if (this.current.readyState > 0) this.current.currentTime = seconds;
    else this.pendingStart = seconds;
  }

  setVolume(volume: number): void {
    this.current.volume = volume;
    this.spare.volume = volume;
  }

  preload(trackId: string | null): void {
    if (trackId === this.spareId) return;
    if (trackId === null || trackId === this.loadedId) {
      this.spare.removeAttribute('src');
      this.spare.load();
      this.spareId = null;
      return;
    }
    this.spare.src = streamUrl(trackId);
    this.spare.load();
    this.spareId = trackId;
  }

  /** Stops playback and removes the event listeners. */
  destroy(): void {
    this.current.pause();
    this.spare.pause();
    for (const detach of this.detachers) detach();
  }

  private load(trackId: string, startAt?: number): void {
    if (this.loadedId === trackId) {
      if (startAt !== undefined) this.seek(startAt);
      return;
    }
    this.current.pause();
    if (this.spareId === trackId) {
      [this.current, this.spare] = [this.spare, this.current];
      this.spareId = null;
    } else {
      this.current.src = streamUrl(trackId);
      this.current.load();
    }
    this.loadedId = trackId;
    this.pendingStart = startAt && startAt > 0 ? startAt : null;
    if (this.pendingStart !== null && this.current.readyState > 0) {
      this.current.currentTime = this.pendingStart;
      this.pendingStart = null;
    } else if (this.current.readyState > 0) {
      this.current.currentTime = 0;
    }
  }

  private listen(element: HTMLAudioElement): void {
    const on = (type: string, handler: () => void) => {
      const listener = () => {
        if (element === this.current) handler();
      };
      element.addEventListener(type, listener);
      this.detachers.push(() => element.removeEventListener(type, listener));
    };
    const time = () => this.reporter.time(element.currentTime, element.duration);
    on('loadedmetadata', () => {
      if (this.pendingStart !== null) {
        element.currentTime = this.pendingStart;
        this.pendingStart = null;
      }
      time();
    });
    on('playing', () => this.reporter.status('playing'));
    on('waiting', () => this.reporter.status('loading'));
    on('pause', () => {
      if (!element.ended) this.reporter.status('paused');
    });
    on('timeupdate', time);
    on('durationchange', time);
    on('ended', () => this.reporter.ended());
    on('error', () => {
      const code = element.error?.code ?? 0;
      this.reporter.error(MEDIA_ERRORS[code] ?? 'Playback failed');
    });
  }
}
