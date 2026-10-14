'use client';

import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import AddIcon from '@mui/icons-material/Add';
import PlaylistIcon from '@mui/icons-material/QueueMusicOutlined';
import { usePlaylistStore } from '@/client/stores/playlistStore';

export interface AddToPlaylistMenuProps {
  /** Where the menu opens (a point on screen), or null when closed. */
  position: { top: number; left: number } | null;
  trackIds: string[];
  onClose(): void;
}

/**
 * Picks a playlist to append tracks to, or creates one with them: the way to fill playlists
 * without drag and drop (mobile), also offered on desktop.
 */
export default function AddToPlaylistMenu({
  position,
  trackIds,
  onClose,
}: Readonly<AddToPlaylistMenuProps>) {
  const playlists = usePlaylistStore((state) => state.playlists);
  const writable = playlists.filter((p) => !p.readonly);
  const pick = (action: () => void) => () => {
    action();
    onClose();
  };
  return (
    <Menu
      open={position !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={position ?? undefined}
      slotProps={{ list: { 'aria-label': 'Add to playlist' } }}
    >
      <MenuItem onClick={pick(() => void usePlaylistStore.getState().create(trackIds))}>
        <ListItemIcon>
          <AddIcon fontSize="small" />
        </ListItemIcon>
        New playlist
      </MenuItem>
      {writable.length > 0 && <Divider />}
      {writable.map((playlist) => (
        <MenuItem
          key={playlist.id}
          onClick={pick(() => void usePlaylistStore.getState().append(playlist.id, trackIds))}
        >
          <ListItemIcon>
            <PlaylistIcon fontSize="small" />
          </ListItemIcon>
          {playlist.name}
        </MenuItem>
      ))}
    </Menu>
  );
}
