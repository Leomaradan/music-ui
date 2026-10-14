'use client';

import { useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import MenuIcon from '@mui/icons-material/Menu';
import MoreIcon from '@mui/icons-material/MoreVert';
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
import { useCurrentTrack, useIsMobile } from '@/client/hooks';
import type { Track } from '@/client/catalog/decode';
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
const openNav = () => useUiStore.getState().setNavOpen(true);

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
  const isMobile = useIsMobile();

  const seekSlider = (
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
  );

  if (isMobile) {
    return (
      <MobilePlayerBar
        track={track}
        error={error}
        playing={playing}
        hasQueue={hasQueue}
        canGoBack={index >= 0}
        canGoNext={index >= 0 && index < queueLength - 1}
        canStop={status !== 'stopped'}
        elapsed={formatDuration(shown)}
        total={formatDuration(total)}
        seekSlider={seekSlider}
      />
    );
  }

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
          {seekSlider}
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

interface MobilePlayerBarProps {
  track: Track | null;
  error: string | null;
  playing: boolean;
  hasQueue: boolean;
  canGoBack: boolean;
  canGoNext: boolean;
  canStop: boolean;
  elapsed: string;
  total: string;
  seekSlider: React.ReactNode;
}

/**
 * Phone layout: menu (sidebar), current track, play/pause and next on the first row; the seek
 * slider and the playback mode on the second. Previous, stop and settings are in the ⋮ menu;
 * the volume is left to the phone's buttons.
 */
function MobilePlayerBar({
  track,
  error,
  playing,
  hasQueue,
  canGoBack,
  canGoNext,
  canStop,
  elapsed,
  total,
  seekSlider,
}: Readonly<MobilePlayerBarProps>) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const fromMenu = (action: () => void) => () => {
    setMenu(null);
    action();
  };
  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar variant="dense" disableGutters sx={{ gap: 1, px: 1 }}>
        <IconButton aria-label="Open navigation" onClick={openNav}>
          <MenuIcon />
        </IconButton>
        <Cover coverArt={track?.coverArt ?? null} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
            {track?.title ?? 'Nothing playing'}
          </Typography>
          {track && (
            <Typography
              variant="caption"
              color={error ? 'error' : 'text.secondary'}
              noWrap
              component="div"
            >
              {error ?? track.artist}
            </Typography>
          )}
        </Box>
        <IconButton
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={toggle}
          disabled={!hasQueue}
          color="primary"
        >
          {playing ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        <IconButton aria-label="Next" onClick={next} disabled={!canGoNext}>
          <SkipNextIcon />
        </IconButton>
        <IconButton
          aria-label="More player actions"
          onClick={(event) => setMenu(event.currentTarget)}
        >
          <MoreIcon />
        </IconButton>
      </Toolbar>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, pb: 0.5 }}>
        <Typography variant="caption" sx={{ minWidth: 32, textAlign: 'right' }}>
          {elapsed}
        </Typography>
        {seekSlider}
        <Typography variant="caption" sx={{ minWidth: 32 }}>
          {total}
        </Typography>
        <PlaybackModeButton />
      </Box>
      <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
        <MenuItem onClick={fromMenu(previous)} disabled={!canGoBack}>
          <ListItemIcon>
            <SkipPreviousIcon fontSize="small" />
          </ListItemIcon>
          Previous
        </MenuItem>
        <MenuItem onClick={fromMenu(stop)} disabled={!canStop}>
          <ListItemIcon>
            <StopIcon fontSize="small" />
          </ListItemIcon>
          Stop
        </MenuItem>
        <MenuItem onClick={fromMenu(openSettings)}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>
      </Menu>
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
