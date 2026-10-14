'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import AutoModeIcon from '@mui/icons-material/AutoAwesomeOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/PlaylistAdd';
import { matchTracks } from '@/client/catalog/dynamic';
import { formatCount } from '@/client/format';
import { useDynamicTracks } from '@/client/hooks';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useDynamicPlaylistStore } from '@/client/stores/dynamicPlaylistStore';
import { notify } from '@/client/stores/notificationStore';
import { usePlayerStore } from '@/client/stores/playerStore';
import { freePlaylistName, usePlaylistStore } from '@/client/stores/playlistStore';
import { viewOfDynamic, type ActiveView } from '@/client/stores/viewStore';
import type { DynamicPlaylist } from '@/lib/dynamicPlaylists/types';

/** Track ids of a dynamic playlist right now (catalog order). */
function currentTrackIds(playlist: DynamicPlaylist): string[] {
  const catalog = useCatalogStore.getState().catalog;
  return catalog ? matchTracks(catalog.tracks, playlist).map((track) => track.id) : [];
}

function play(playlist: DynamicPlaylist): void {
  const ids = currentTrackIds(playlist);
  if (ids.length === 0) notify(`No tracks match "${playlist.name}"`, 'info');
  else usePlayerStore.getState().playSelection(ids, null);
}

/** A copy of the current tracks as a regular (Navidrome) playlist. */
function saveAsPlaylist(playlist: DynamicPlaylist): void {
  const taken = usePlaylistStore.getState().playlists.map((p) => p.name);
  void usePlaylistStore
    .getState()
    .create(currentTrackIds(playlist), freePlaylistName(taken, playlist.name));
}

interface SmartPlaylistsProps {
  activeView: ActiveView;
  onShow(view: ActiveView): void;
}

/**
 * Sidebar section of the dynamic (smart) playlists: click shows the matching tracks,
 * double-click plays them, the context menu edits, copies or deletes.
 */
export default function SmartPlaylists({ activeView, onShow }: Readonly<SmartPlaylistsProps>) {
  const playlists = useDynamicPlaylistStore((state) => state.playlists);
  const [menu, setMenu] = useState<{ top: number; left: number; id: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DynamicPlaylist | null>(null);
  const menuPlaylist = playlists.find((p) => p.id === menu?.id);

  const fromMenu = (action: (playlist: DynamicPlaylist) => void) => () => {
    if (menuPlaylist) action(menuPlaylist);
    setMenu(null);
  };

  return (
    <>
      <ListSubheader
        component="div"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}
      >
        Smart playlists
        <Tooltip title="New smart playlist">
          <IconButton
            size="small"
            aria-label="New smart playlist"
            onClick={() => useDynamicPlaylistStore.getState().edit()}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </ListSubheader>
      {playlists.length > 0 && (
        <List
          dense
          disablePadding
          aria-label="Smart playlists"
          sx={{ flex: 'none', maxHeight: '30%', overflowY: 'auto' }}
        >
          {playlists.map((playlist) => (
            <SmartPlaylistItem
              key={playlist.id}
              playlist={playlist}
              selected={activeView === viewOfDynamic(playlist.id)}
              onOpen={() => onShow(viewOfDynamic(playlist.id))}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ top: event.clientY, left: event.clientX, id: playlist.id });
              }}
            />
          ))}
        </List>
      )}

      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ?? undefined}
      >
        <MenuItem onClick={fromMenu((p) => useDynamicPlaylistStore.getState().edit(p.id))}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          Edit…
        </MenuItem>
        <MenuItem onClick={fromMenu(saveAsPlaylist)}>
          <ListItemIcon>
            <SaveIcon fontSize="small" />
          </ListItemIcon>
          Save as playlist
        </MenuItem>
        <MenuItem onClick={fromMenu(setConfirmDelete)}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          Delete…
        </MenuItem>
      </Menu>

      <Dialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete “{confirmDelete?.name}”?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Only the smart playlist&apos;s criteria are deleted. The tracks themselves are not
            affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              if (confirmDelete) void useDynamicPlaylistStore.getState().remove(confirmDelete.id);
              setConfirmDelete(null);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

interface SmartPlaylistItemProps {
  playlist: DynamicPlaylist;
  selected: boolean;
  onOpen(): void;
  onContextMenu(event: React.MouseEvent): void;
}

function SmartPlaylistItem({
  playlist,
  selected,
  onOpen,
  onContextMenu,
}: Readonly<SmartPlaylistItemProps>) {
  const count = useDynamicTracks(playlist.id).length;
  return (
    <li>
      <ListItemButton
        selected={selected}
        onClick={onOpen}
        onDoubleClick={() => play(playlist)}
        onContextMenu={onContextMenu}
      >
        <ListItemIcon>
          <AutoModeIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary={playlist.name}
          slotProps={{ primary: { noWrap: true, title: playlist.name } }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {formatCount(count)}
        </Typography>
      </ListItemButton>
    </li>
  );
}
