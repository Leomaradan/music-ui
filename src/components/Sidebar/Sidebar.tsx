'use client';

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
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
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import LockIcon from '@mui/icons-material/LockOutlined';
import PlaylistIcon from '@mui/icons-material/QueueMusicOutlined';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import { droppedName, droppedTracks, endTrackDrag, isTrackDrag } from '@/client/dnd';
import { formatCount } from '@/client/format';
import { usePlayerStore } from '@/client/stores/playerStore';
import { freePlaylistName, usePlaylistStore } from '@/client/stores/playlistStore';
import { notify } from '@/client/stores/notificationStore';
import { useSelectionStore } from '@/client/stores/selectionStore';
import {
  playlistOfView,
  useViewStore,
  viewOfPlaylist,
  type ActiveView,
} from '@/client/stores/viewStore';
import type { PlaylistSummary } from '@/lib/playlists/types';

/** Where tracks can be dropped: the queue, a playlist, or the "new playlist" zone. */
type DropKey = 'queue' | 'new' | `playlist:${string}`;

/**
 * Sidebar (PLAN.md §7.2): Currently playing, Filter results, then the custom playlists, which
 * can be reordered by drag and drop (double-click plays one; rename from the context menu).
 * Tracks dragged from the table can be dropped on the queue (appended), on a playlist
 * (appended), or on the zone above the playlists (new playlist).
 */
export default function Sidebar() {
  const activeView = useViewStore((state) => state.activeView);
  const queueLength = usePlayerStore((state) => state.queue.length);
  const playlists = usePlaylistStore((state) => state.playlists);
  const [dropTarget, setDropTarget] = useState<DropKey | null>(null);
  const [menu, setMenu] = useState<{ top: number; left: number; id: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PlaylistSummary | null>(null);

  const show = (view: ActiveView) => {
    if (view !== activeView) useSelectionStore.getState().clear();
    useViewStore.getState().setActiveView(view);
    const id = playlistOfView(view);
    if (id) void usePlaylistStore.getState().loadTracks(id);
  };

  /** Native drop-target handlers for tracks dragged from the table. */
  const dropTargetProps = (key: DropKey, accepts: boolean) => ({
    onDragOver: (event: DragEvent) => {
      if (!accepts || !isTrackDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (dropTarget !== key) setDropTarget(key);
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDropTarget(null);
      const trackIds = droppedTracks(event.dataTransfer);
      const name = droppedName(event.dataTransfer);
      endTrackDrag();
      if (!trackIds?.length) return;
      if (key === 'queue') {
        usePlayerStore.getState().enqueue(trackIds);
        notify(
          `Added ${trackIds.length} track${trackIds.length === 1 ? '' : 's'} to the queue`,
          'success',
        );
      } else if (key === 'new') {
        // Named after what was dragged from a filter ("Aerosmith"), made unique if taken.
        const taken = usePlaylistStore.getState().playlists.map((p) => p.name);
        void usePlaylistStore
          .getState()
          .create(trackIds, name ? freePlaylistName(taken, name) : undefined);
      } else {
        void usePlaylistStore.getState().append(key.slice('playlist:'.length), trackIds);
      }
    },
  });

  const sensors = useSensors(
    // A small move is needed to start dragging, so clicks still select.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onSortEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = playlists.map((p) => p.id);
    void usePlaylistStore
      .getState()
      .move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };

  const menuPlaylist = playlists.find((p) => p.id === menu?.id);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <List dense disablePadding>
        <DropHighlight active={dropTarget === 'queue'}>
          <ListItemButton
            selected={activeView === 'queue'}
            onClick={() => show('queue')}
            {...dropTargetProps('queue', true)}
          >
            <ListItemIcon>
              <QueueMusicIcon />
            </ListItemIcon>
            <ListItemText primary="Currently playing" />
            {queueLength > 0 && (
              <Typography variant="caption" color="text.secondary">
                {formatCount(queueLength)}
              </Typography>
            )}
          </ListItemButton>
        </DropHighlight>
        <ListItemButton selected={activeView === 'filter'} onClick={() => show('filter')}>
          <ListItemIcon>
            <FilterListIcon />
          </ListItemIcon>
          <ListItemText primary="Filter results" />
        </ListItemButton>
      </List>
      <Divider />
      <ListSubheader
        component="div"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}
      >
        Playlists
        <Tooltip title="New playlist">
          <IconButton
            size="small"
            aria-label="New playlist"
            onClick={() => void usePlaylistStore.getState().create()}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </ListSubheader>

      <Box
        role="region"
        aria-label="New playlist drop zone"
        {...dropTargetProps('new', true)}
        sx={{
          flex: 'none',
          mx: 1,
          mb: 1,
          px: 1.5,
          py: 1,
          borderRadius: 1,
          border: 1,
          borderStyle: 'dashed',
          borderColor: dropTarget === 'new' ? 'primary.main' : 'divider',
          bgcolor: dropTarget === 'new' ? 'action.hover' : 'transparent',
          color: 'text.secondary',
          typography: 'caption',
          textAlign: 'center',
        }}
      >
        Drop tracks here to create a playlist
      </Box>
      {/* Only the playlists scroll: the entries above and the drop zone stay in view. */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onSortEnd}
        >
          <SortableContext
            items={playlists.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <List dense disablePadding aria-label="Playlists">
              {playlists.map((playlist) => (
                <SortablePlaylist
                  key={playlist.id}
                  playlist={playlist}
                  selected={activeView === viewOfPlaylist(playlist.id)}
                  dropActive={dropTarget === viewOfPlaylist(playlist.id)}
                  dropProps={dropTargetProps(
                    viewOfPlaylist(playlist.id) as DropKey,
                    !playlist.readonly,
                  )}
                  onOpen={() => show(viewOfPlaylist(playlist.id))}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ top: event.clientY, left: event.clientX, id: playlist.id });
                  }}
                />
              ))}
            </List>
          </SortableContext>
        </DndContext>
      </Box>

      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ?? undefined}
      >
        <MenuItem
          disabled={menuPlaylist?.readonly}
          onClick={() => {
            usePlaylistStore.getState().setRenaming(menu?.id ?? null);
            setMenu(null);
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          Rename
        </MenuItem>
        <MenuItem
          disabled={menuPlaylist?.readonly}
          onClick={() => {
            setConfirmDelete(menuPlaylist ?? null);
            setMenu(null);
          }}
        >
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
            The playlist is deleted from Navidrome, for every app using this account. The tracks
            themselves are not affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              if (confirmDelete) void usePlaylistStore.getState().remove(confirmDelete.id);
              setConfirmDelete(null);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function DropHighlight({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <Box
      sx={{
        outline: active ? 2 : 0,
        outlineColor: 'primary.main',
        outlineStyle: 'solid',
        outlineOffset: -2,
        borderRadius: 1,
      }}
    >
      {children}
    </Box>
  );
}

interface SortablePlaylistProps {
  playlist: PlaylistSummary;
  selected: boolean;
  dropActive: boolean;
  dropProps: Record<string, (event: DragEvent) => void>;
  onOpen(): void;
  onContextMenu(event: React.MouseEvent): void;
}

function SortablePlaylist({
  playlist,
  selected,
  dropActive,
  dropProps,
  onOpen,
  onContextMenu,
}: SortablePlaylistProps) {
  const renaming = usePlaylistStore((state) => state.renamingId === playlist.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: playlist.id,
    disabled: renaming,
  });

  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      sx={{
        position: 'relative',
        zIndex: isDragging ? 1 : undefined,
        opacity: isDragging ? 0.8 : 1,
      }}
    >
      <DropHighlight active={dropActive}>
        <ListItemButton
          selected={selected}
          onClick={onOpen}
          onDoubleClick={() => void usePlaylistStore.getState().play(playlist.id)}
          onContextMenu={onContextMenu}
          {...attributes}
          {...listeners}
          {...dropProps}
          aria-roledescription="playlist"
          sx={{ cursor: isDragging ? 'grabbing' : undefined }}
        >
          <ListItemIcon>
            {playlist.readonly ? <LockIcon fontSize="small" /> : <PlaylistIcon fontSize="small" />}
          </ListItemIcon>
          {renaming ? (
            <RenameField playlist={playlist} />
          ) : (
            <ListItemText
              primary={playlist.name}
              slotProps={{ primary: { noWrap: true, title: playlist.name } }}
            />
          )}
          {!renaming && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {formatCount(playlist.songCount)}
            </Typography>
          )}
        </ListItemButton>
      </DropHighlight>
    </Box>
  );
}

const rename = (id: string, name: string) => void usePlaylistStore.getState().rename(id, name);
const cancelRename = () => usePlaylistStore.getState().setRenaming(null);

function RenameField({ playlist }: { playlist: PlaylistSummary }) {
  const [value, setValue] = useState(playlist.name);
  const input = useRef<HTMLInputElement>(null);
  // Focus the field when renaming starts (right after creating a playlist, or on request).
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <InputBase
      inputRef={input}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => rename(playlist.id, value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') rename(playlist.id, value);
        if (event.key === 'Escape') cancelRename();
      }}
      onClick={(event) => event.stopPropagation()}
      inputProps={{ 'aria-label': 'Playlist name' }}
      sx={{ flex: 1, fontSize: 14, borderBottom: 1, borderColor: 'primary.main' }}
    />
  );
}
