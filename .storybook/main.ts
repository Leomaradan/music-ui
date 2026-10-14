import type { StorybookConfig } from '@storybook/nextjs-vite';
import type { Plugin } from 'vitest/config';

/** Seconds of silence served for every track: long enough to observe playback in a test. */
const TRACK_SECONDS = 30;
const SAMPLE_RATE = 8_000;

/** A mono 8-bit PCM WAV file of silence. */
function silentWav(seconds: number): Buffer {
  const samples = seconds * SAMPLE_RATE;
  const wav = Buffer.alloc(44 + samples, 128);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + samples, 4);
  wav.write('WAVEfmt ', 8, 'ascii');
  wav.writeUInt32LE(16, 16); // fmt chunk size
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE, 28); // byte rate
  wav.writeUInt16LE(1, 32); // block align
  wav.writeUInt16LE(8, 34); // bits per sample
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(samples, 40);
  return wav;
}

/** A flat cover whose colour depends on the cover id, so different albums look different. */
function cover(id: string): string {
  let hue = 0;
  for (const char of id) hue = (hue * 31 + char.codePointAt(0)!) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="hsl(${hue} 45% 45%)"/></svg>`;
}

/**
 * Serves /api/stream/* and /api/cover/* in Storybook and the story tests, which have no Next
 * server: audio and image elements load these URLs directly, so the JSON fake API (a fetch
 * stub) cannot answer them.
 */
export function fakeMedia(): Plugin {
  const wav = silentWav(TRACK_SECONDS);
  return {
    name: 'music-ui:fake-media',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0]!;
        if (path.startsWith('/api/stream/')) {
          // Byte ranges, like the real /api/stream: browsers only seek in media served this way.
          const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
          const start = range?.[1] ? Number(range[1]) : 0;
          const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
          response.statusCode = range ? 206 : 200;
          response.setHeader('accept-ranges', 'bytes');
          response.setHeader('content-type', 'audio/wav');
          response.setHeader('content-length', String(end - start + 1));
          if (range) response.setHeader('content-range', `bytes ${start}-${end}/${wav.length}`);
          response.end(wav.subarray(start, end + 1));
        } else if (path.startsWith('/api/cover/')) {
          response.setHeader('content-type', 'image/svg+xml');
          response.end(cover(decodeURIComponent(path.slice('/api/cover/'.length))));
        } else {
          next();
        }
      });
    },
  };
}

const config: StorybookConfig = {
  framework: '@storybook/nextjs-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  core: { disableTelemetry: true },
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: [...(viteConfig.plugins ?? []), fakeMedia()],
  }),
};

export default config;
