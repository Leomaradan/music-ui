'use client';

import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { formatCount, formatTotalDuration } from '@/client/format';
import { useTableTracks } from '@/client/hooks';
import { useFilterStore } from '@/client/stores/filterStore';
import { useSelectionStore } from '@/client/stores/selectionStore';
import { useViewStore } from '@/client/stores/viewStore';

/** Summary under the track table: count, total time, selection, removed tracks. */
export default function StatusBar() {
  const tracks = useTableTracks();
  const selected = useSelectionStore((state) => state.selection.ids.size);
  const view = useViewStore((state) => state.activeView);
  const excluded = useFilterStore((state) => state.excluded.length);
  const restore = useFilterStore((state) => state.restoreExcluded);
  const duration = useMemo(() => tracks.reduce((sum, track) => sum + track.duration, 0), [tracks]);

  const parts = [
    `${formatCount(tracks.length)} ${tracks.length === 1 ? 'track' : 'tracks'}`,
    tracks.length > 0 ? formatTotalDuration(duration) : null,
    selected > 0 ? `${formatCount(selected)} selected` : null,
  ].filter(Boolean);

  return (
    <Box
      role="status"
      aria-label="Track summary"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        minHeight: 32,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {parts.join(' · ')}
      </Typography>
      {view === 'filter' && excluded > 0 && (
        <Typography variant="caption" color="text.secondary">
          {formatCount(excluded)} removed from results
          <Button size="small" onClick={restore} sx={{ ml: 1, py: 0, minWidth: 0 }}>
            Restore
          </Button>
        </Typography>
      )}
    </Box>
  );
}
