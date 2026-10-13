'use client';

import { useState, type ReactNode } from 'react';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import AlbumIcon from '@mui/icons-material/Album';
import CasinoIcon from '@mui/icons-material/Casino';
import OrderIcon from '@mui/icons-material/FormatListNumbered';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import PeopleIcon from '@mui/icons-material/PeopleAlt';
import RecentActorsIcon from '@mui/icons-material/RecentActors';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import { PLAYBACK_MODES, type PlaybackMode } from '@/client/player/modes';
import { usePlayerStore } from '@/client/stores/playerStore';

export const MODE_ICONS: Record<PlaybackMode, ReactNode> = {
  order: <OrderIcon />,
  shuffle: <ShuffleIcon />,
  random: <CasinoIcon />,
  albumShuffle: <AlbumIcon />,
  albumRandom: <LibraryMusicIcon />,
  artistShuffle: <PeopleIcon />,
  artistRandom: <RecentActorsIcon />,
};

const setMode = (mode: PlaybackMode) => usePlayerStore.getState().setMode(mode);

/** Playback mode picker (in order, shuffle, random… by track, album or artist). */
export default function PlaybackModeButton() {
  const mode = usePlayerStore((state) => state.mode);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = PLAYBACK_MODES.find((entry) => entry.mode === mode)!;

  return (
    <>
      <Tooltip title={`Playback: ${current.label}`}>
        <IconButton
          aria-label={`Playback mode: ${current.label}`}
          aria-haspopup="menu"
          color={mode === 'order' ? 'default' : 'primary'}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          {MODE_ICONS[mode]}
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        slotProps={{ list: { 'aria-label': 'Playback mode' } }}
      >
        {PLAYBACK_MODES.map((entry) => (
          <MenuItem
            key={entry.mode}
            selected={entry.mode === mode}
            onClick={() => {
              setMode(entry.mode);
              setAnchor(null);
            }}
          >
            <ListItemIcon>{MODE_ICONS[entry.mode]}</ListItemIcon>
            <ListItemText primary={entry.label} secondary={entry.description} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
