import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

/** Cascade order of the filter boxes (PLAN.md §7.3). */
export const FILTER_BOXES = ['Music Folder', 'Genre', 'Artist', 'Album'] as const;

/** Static filter boxes. The cascading multi-select logic arrives in M6. */
export default function Filters() {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${FILTER_BOXES.length}, 1fr)`,
        gap: 1,
        p: 1,
        minHeight: 0,
      }}
    >
      {FILTER_BOXES.map((label) => (
        <Paper
          key={label}
          variant="outlined"
          component="section"
          aria-label={label}
          sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <Typography
            variant="subtitle2"
            sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}
          >
            {label}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1 }}>
            All
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}
