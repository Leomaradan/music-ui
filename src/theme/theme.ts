'use client';

import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: { palette: { primary: { main: '#1e6b52' } } },
    dark: { palette: { primary: { main: '#5fd3a6' } } },
  },
  typography: { fontFamily: 'var(--font-roboto)' },
  shape: { borderRadius: 6 },
  components: {
    MuiTableCell: { styleOverrides: { sizeSmall: { paddingBlock: 4 } } },
  },
});

export default theme;
