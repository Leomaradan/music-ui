import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import StopIcon from '@mui/icons-material/Stop';

/** Static player bar. The audio engine is wired in M8. */
export default function PlayerBar() {
  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar sx={{ gap: 2 }}>
        <Box sx={{ display: 'flex' }}>
          <IconButton aria-label="Previous" disabled>
            <SkipPreviousIcon />
          </IconButton>
          <IconButton aria-label="Play" disabled>
            <PlayArrowIcon />
          </IconButton>
          <IconButton aria-label="Stop" disabled>
            <StopIcon />
          </IconButton>
          <IconButton aria-label="Next" disabled>
            <SkipNextIcon />
          </IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ width: 240 }}>
          Nothing playing
        </Typography>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="caption">0:00</Typography>
          <Slider aria-label="Playback position" size="small" value={0} disabled />
          <Typography variant="caption">0:00</Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
