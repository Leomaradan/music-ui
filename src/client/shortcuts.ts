/** Keyboard shortcuts, as shown in Settings → Shortcuts. "Mod" is Ctrl (⌘ on macOS). */
export const SHORTCUTS: readonly { keys: string[][]; action: string; where?: string }[] = [
  { keys: [['Space']], action: 'Play / pause' },
  { keys: [['Mod', '→']], action: 'Next track' },
  { keys: [['Mod', '←']], action: 'Previous track (restarts the track after 3 s)' },
  { keys: [['Enter']], action: 'Play the selected track', where: 'Track list' },
  { keys: [['↑'], ['↓']], action: 'Move the selection', where: 'Track list' },
  {
    keys: [
      ['Shift', '↑'],
      ['Shift', '↓'],
    ],
    action: 'Extend the selection',
    where: 'Track list',
  },
  { keys: [['Mod', 'A']], action: 'Select all tracks', where: 'Track list' },
  {
    keys: [['Delete'], ['Backspace']],
    action: 'Remove the selection (from the results, the queue or the playlist)',
    where: 'Track list',
  },
  { keys: [['Escape']], action: 'Clear the selection', where: 'Track list' },
  { keys: [['?']], action: 'Show these shortcuts' },
];
