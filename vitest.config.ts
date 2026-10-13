import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        // Unit, route and jsdom UI tests.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
        },
      },
      {
        // Every story is a test: it renders, passes its play function and the a11y checks,
        // in headless Chromium.
        plugins: [
          storybookTest({ configDir: fileURLToPath(new URL('.storybook', import.meta.url)) }),
        ],
        // Pre-bundle every dependency of the stories up front: one discovered mid-run makes Vite
        // reload the browser and fail the test files that were loading.
        optimizeDeps: { entries: ['src/**/*.stories.tsx', '.storybook/preview.tsx'] },
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                // A Chromium other than Playwright's own download (e.g. a pre-installed one).
                executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
                // Lets the player start without a user gesture, as after a click in the app.
                args: ['--autoplay-policy=no-user-gesture-required'],
              },
            }),
            instances: [{ browser: 'chromium' }],
            viewport: { width: 1280, height: 800 },
          },
        },
      },
    ],
  },
});
