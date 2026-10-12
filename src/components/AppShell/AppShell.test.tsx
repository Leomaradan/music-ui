import { render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '@/theme/theme';
import AppShell from './AppShell';

function renderShell() {
  return render(
    <ThemeProvider theme={theme}>
      <AppShell />
    </ThemeProvider>,
  );
}

describe('AppShell', () => {
  it('renders the player controls', () => {
    renderShell();
    for (const name of ['Previous', 'Play', 'Stop', 'Next']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeInTheDocument();
  });

  it('lists the fixed sidebar entries in order', () => {
    renderShell();
    const nav = screen.getByRole('navigation');
    const entries = within(nav)
      .getAllByRole('button')
      .map((el) => el.textContent);
    expect(entries.slice(0, 2)).toEqual(['Currently playing', 'Filter results']);
  });

  it('renders the four filter boxes in cascade order', () => {
    renderShell();
    const boxes = screen.getAllByRole('region').map((el) => el.getAttribute('aria-label'));
    expect(boxes).toEqual(['Music Folder', 'Genre', 'Artist', 'Album']);
  });

  it('renders the track table header', () => {
    renderShell();
    const table = screen.getByRole('table', { name: 'Tracks' });
    expect(within(table).getByRole('columnheader', { name: 'Title' })).toBeInTheDocument();
  });
});
