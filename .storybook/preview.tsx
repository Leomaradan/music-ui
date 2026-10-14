import { useEffect, useRef } from 'react';
import type { Decorator, Preview } from '@storybook/nextjs-vite';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import { ThemeProvider, useColorScheme } from '@mui/material/styles';
import theme from '@/theme/theme';
import { resetApp, type AppParameters } from '../tests/helpers/stories';

type Mode = 'light' | 'dark';

/**
 * Applies the toolbar's theme to MUI's colour scheme (class-based, as in the app) when the
 * toolbar changes, so a story can still switch the scheme itself (Settings › Appearance).
 */
function ColorScheme({ mode }: { mode: Mode }) {
  const { setMode } = useColorScheme();
  const applied = useRef<Mode | null>(null);
  useEffect(() => {
    if (applied.current === mode) return;
    applied.current = mode;
    setMode(mode);
  }, [mode, setMode]);
  return null;
}

const withTheme: Decorator = (Story, context) => (
  <ThemeProvider theme={theme}>
    <CssBaseline enableColorScheme />
    {/* The app loads Roboto with next/font; Storybook falls back to the system font. */}
    <GlobalStyles styles={{ ':root': { '--font-roboto': 'Roboto, system-ui, sans-serif' } }} />
    <ColorScheme mode={(context.globals.theme as Mode | undefined) ?? 'light'} />
    <Story />
  </ThemeProvider>
);

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Colour scheme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // Accessibility violations fail the story tests.
    a11y: { test: 'error' },
  },
  // Every story starts from a clean app: stores, storage and a fresh fake API.
  // No autodocs: the stories of a component share the app's global stores, so they cannot
  // render side by side on one docs page.
  beforeEach: ({ parameters }) => resetApp(parameters as AppParameters),
};

export default preview;
