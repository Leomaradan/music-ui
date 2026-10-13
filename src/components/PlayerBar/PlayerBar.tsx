'use client';

import { useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import PauseIcon from '@mui/icons-material/Pause';
import SettingsIcon from '@mui/icons-material/Settings';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import StopIcon from '@mui/icons-material/Stop';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { formatDuration } from '@/client/format';
import { useCurrentTrack } from '@/client/hooks';
import { usePlayerStore } from '@/client/stores/playerStore';
import { useUiStore } from '@/client/stores/uiStore';
import PlaybackModeButton from './PlaybackModeButton';

const player = () => usePlayerStore.getState();
const toggle = () => player().toggle();
const stop = () => player().stop();
const next = () => player().next();
const previous = () => player().previous();
const seek = (seconds: number) => player().seek(seconds);
const setVolume = (volume: number) => player().setVolume(volume);
const openSettings = () => useUiStore.getState().openSettings();

/**
 * Top bar (PLAN.md §7.1): transport buttons, playback mode, current track, seek slider,
 * volume, settings.
 */
export default function PlayerBar() {
  const status = usePlayerStore((state) => state.status);
  const index = usePlayerStore((state) => state.index);
  const queueLength = usePlayerStore((state) => state.queue.length);
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const volume = usePlayerStore((state) => state.volume);
  const error = usePlayerStore((state) => state.error);
  const track = useCurrentTrack();
  // Slider value while dragging: seek only on release.
  const [dragging, setDragging] = useState<number | null>(null);
  const [volumeBeforeMute, setVolumeBeforeMute] = useState(1);

  const playing = status === 'playing' || status === 'loading';
  const total = duration || track?.duration || 0;
  const shown = dragging ?? position;
  const hasQueue = queueLength > 0;

  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar sx={{ gap: 2 }}>
        <Box sx={{ display: 'flex' }}>
          <IconButton aria-label="Previous" onClick={previous} disabled={index < 0}>
            <SkipPreviousIcon />
          </IconButton>
          <IconButton
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={toggle}
            disabled={!hasQueue}
            color="primary"
          >
            {playing ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
          <IconButton aria-label="Stop" onClick={stop} disabled={status === 'stopped'}>
            <StopIcon />
          </IconButton>
          <IconButton
            aria-label="Next"
            onClick={next}
            disabled={index < 0 || index >= queueLength - 1}
          >
            <SkipNextIcon />
          </IconButton>
          <PlaybackModeButton />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: 300, minWidth: 0 }}>
          <Cover coverArt={track?.coverArt ?? null} />
          <Box sx={{ minWidth: 0 }}>
            {track ? (
              <>
                <Typography variant="body2" noWrap sx={{ fontWeight: 500 }} title={track.title}>
                  {track.title}
                </Typography>
                {error ? (
                  <Typography variant="caption" color="error" noWrap component="div" title={error}>
                    {error}
                  </Typography>
                ) : (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    component="div"
                    title={[track.artist, track.album].filter(Boolean).join(' — ')}
                  >
                    {[track.artist, track.album].filter(Boolean).join(' — ')}
                  </Typography>
                )}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary" noWrap>
                Nothing playing
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, minWidth: 120 }}>
          <Typography variant="caption" sx={{ minWidth: 36, textAlign: 'right' }}>
            {formatDuration(shown)}
          </Typography>
          <Slider
            aria-label="Playback position"
            size="small"
            min={0}
            max={total || 1}
            step={1}
            value={Math.min(shown, total || 1)}
            disabled={!track || total === 0}
            onChange={(_, value) => setDragging(value as number)}
            onChangeCommitted={(_, value) => {
              seek(value as number);
              setDragging(null);
            }}
            getAriaValueText={(value) => formatDuration(value)}
          />
          <Typography variant="caption" sx={{ minWidth: 36 }}>
            {formatDuration(total)}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 140 }}>
          <Tooltip title={volume === 0 ? 'Unmute' : 'Mute'}>
            <IconButton
              aria-label={volume === 0 ? 'Unmute' : 'Mute'}
              size="small"
              onClick={() => {
                if (volume === 0) setVolume(volumeBeforeMute || 1);
                else {
                  setVolumeBeforeMute(volume);
                  setVolume(0);
                }
              }}
            >
              {volume === 0 ? (
                <VolumeOffIcon fontSize="small" />
              ) : (
                <VolumeUpIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Slider
            aria-label="Volume"
            size="small"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(_, value) => setVolume(value as number)}
          />
        </Box>
        <Tooltip title="Settings">
          <IconButton aria-label="Settings" onClick={openSettings}>
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}

function Cover({ coverArt }: { coverArt: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  const size = 40;
  if (!coverArt || failed === coverArt) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          flex: 'none',
          borderRadius: 1,
          bgcolor: 'action.hover',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <MusicNoteIcon fontSize="small" color="disabled" />
      </Box>
    );
  }
  return (
    <Box
      component="img"
      src={`/api/cover/${encodeURIComponent(coverArt)}?size=64`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(coverArt)}
      sx={{ flex: 'none', borderRadius: 1, objectFit: 'cover' }}
    />
  );
}
