'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { flexRender, useTable, type Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import MoreIcon from '@mui/icons-material/MoreVert';
import PlayIcon from '@mui/icons-material/PlayArrow';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import PlayNextIcon from '@mui/icons-material/PlaylistPlay';
import QueueIcon from '@mui/icons-material/AddToQueue';
import RemoveIcon from '@mui/icons-material/PlaylistRemove';
import NowPlayingIcon from '@mui/icons-material/VolumeUp';
import type { Track } from '@/client/catalog/decode';
import { endTrackDrag, startTrackDrag } from '@/client/dnd';
import { useIsMobile, useTableTracks } from '@/client/hooks';
import { clickSelection, moveSelection } from '@/client/selection';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { selectCurrentTrackId, usePlayerStore } from '@/client/stores/playerStore';
import { usePlaylistStore } from '@/client/stores/playlistStore';
import { useSelectionStore } from '@/client/stores/selectionStore';
import {
  dynamicOfView,
  playlistOfView,
  useViewStore,
  type SortEntry,
} from '@/client/stores/viewStore';
import { addTracksToQueue, playTracksNext } from '@/client/trackActions';
import AddToPlaylistMenu from '@/components/AddToPlaylistMenu/AddToPlaylistMenu';
import { columns, features, mobileColumns } from './columns';

export const ROW_HEIGHT = 32;
/** Phone layout: two lines per row, easier to tap. */
export const MOBILE_ROW_HEIGHT = 56;
const MENU_CELL_WIDTH = 48;
/** Read by screen readers only. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

type Updater<T> = T | ((previous: T) => T);
const resolve = <T,>(updater: Updater<T>, previous: T): T =>
  typeof updater === 'function' ? (updater as (previous: T) => T)(previous) : updater;

/**
 * Row ids in ordered views (the queue, playlists) are positions: a track can appear twice.
 * In the filter results they are track ids.
 */
const positionRowId = (index: number) => `i${index}`;
const positionOf = (rowId: string) => Number(rowId.slice(1));
const NO_SORTING: SortEntry[] = [];

/**
 * Virtualized track table (PLAN.md §7.4): sortable and resizable columns, multi-select
 * (click, Ctrl/Cmd, Shift, Ctrl+A, arrows), Delete / context menu to remove tracks (from the
 * filter results, the queue or a playlist), double-click / Enter to play, rows draggable to
 * the sidebar.
 */
export default function TrackTable() {
  const data = useTableTracks();
  const view = useViewStore((state) => state.activeView);
  const sorting = useViewStore((state) => state.sorting);
  const columnSizing = useViewStore((state) => state.columnSizing);
  const selection = useSelectionStore((state) => state.selection);
  const setSelection = useSelectionStore((state) => state.setSelection);
  const exclude = useFilterStore((state) => state.exclude);
  const currentTrackId = usePlayerStore(selectCurrentTrackId);
  const currentIndex = usePlayerStore((state) => state.index);
  const playbackStatus = usePlayerStore((state) => state.status);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const [playlistMenu, setPlaylistMenu] = useState<{ top: number; left: number } | null>(null);
  const isMobile = useIsMobile();
  const rowHeight = isMobile ? MOBILE_ROW_HEIGHT : ROW_HEIGHT;
  const scrollRef = useRef<HTMLDivElement>(null);
  const isQueue = view === 'queue';
  const playlistId = playlistOfView(view);
  const playlistReadonly = usePlaylistStore(
    (state) => state.playlists.find((p) => p.id === playlistId)?.readonly ?? false,
  );
  const playlistLoading = usePlaylistStore((state) =>
    playlistId ? state.tracks[playlistId] === undefined : false,
  );
  /** Computed by a smart playlist: sortable like the filter results, but nothing to remove. */
  const isDynamic = dynamicOfView(view) !== null;
  /** The queue and playlists keep their own order: no sorting, positional row ids. */
  const isOrdered = isQueue || playlistId !== null;

  const getRowId = useCallback(
    (track: Track, index: number) => (isOrdered ? positionRowId(index) : track.id),
    [isOrdered],
  );

  const table = useTable({
    features,
    columns: isMobile ? mobileColumns : columns,
    data,
    getRowId,
    state: { sorting: isOrdered ? NO_SORTING : sorting, columnSizing },
    enableSorting: !isOrdered,
    onSortingChange: (updater) => {
      const { sorting: previous, setSorting } = useViewStore.getState();
      setSorting(resolve(updater as Updater<SortEntry[]>, previous));
    },
    onColumnSizingChange: (updater) => {
      const { columnSizing: previous, setColumnSizing } = useViewStore.getState();
      setColumnSizing(resolve(updater, previous));
    },
    columnResizeMode: 'onChange',
  });

  const rows = table.getRowModel().rows;
  const order = useMemo(() => rows.map((row) => row.id), [rows]);
  const totalWidth = table.getTotalSize();
  const columnSizesKey = table
    .getAllLeafColumns()
    .map((column) => column.getSize())
    .join(',');

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 15,
  });
  // Rows change height between the desktop and phone layouts.
  useEffect(() => virtualizer.measure(), [virtualizer, rowHeight]);

  /** The current track: its queue position in the queue, the track itself elsewhere. */
  const isCurrent = (row: { id: string; original: Track }) =>
    isQueue
      ? currentIndex >= 0 && row.id === positionRowId(currentIndex)
      : row.original.id === currentTrackId;
  const isPlaying = playbackStatus === 'playing' || playbackStatus === 'loading';

  const hasSelection = selection.ids.size > 0;
  const canRemove = hasSelection && !isDynamic && !(playlistId && playlistReadonly);
  const removeSelected = () => {
    setMenu(null);
    if (!canRemove) return;
    if (isQueue) {
      usePlayerStore.getState().removeFromQueue([...selection.ids].map(positionOf));
      setSelection({ ids: new Set(), anchor: null });
    } else if (playlistId) {
      void usePlaylistStore.getState().removeTracks(playlistId, [...selection.ids].map(positionOf));
      setSelection({ ids: new Set(), anchor: null });
    } else {
      exclude(selection.ids);
    }
  };

  // Row handlers read the latest state through a ref so they stay stable and memoized
  // rows only re-render when their own props change (smooth scrolling on large lists).
  const latest = useRef({ selection, order, isQueue, rows, isMobile });
  latest.current = { selection, order, isQueue, rows, isMobile };

  /** Plays a row: in the queue, jumps to it; elsewhere, the listed rows become the queue. */
  const playRow = useCallback((id: string) => {
    const player = usePlayerStore.getState();
    const { isQueue: inQueue, rows: listed } = latest.current;
    if (inQueue) {
      player.playIndex(positionOf(id));
    } else {
      player.playSelection(
        listed.map((row) => row.original.id),
        listed.findIndex((row) => row.id === id),
      );
    }
  }, []);

  /** Drags the selected rows (or only this row when it is not selected) to the sidebar. */
  const onRowDragStart = useCallback(
    (event: DragEvent, id: string) => {
      const { selection: current, rows: listed } = latest.current;
      let dragged = listed.filter((row) => row.id === id);
      if (current.ids.has(id)) dragged = listed.filter((row) => current.ids.has(row.id));
      else setSelection({ ids: new Set([id]), anchor: id });
      startTrackDrag(
        event.dataTransfer,
        dragged.map((row) => row.original.id),
      );
    },
    [setSelection],
  );
  const playSelected = () => {
    setMenu(null);
    const first = order.find((id) => selection.ids.has(id));
    if (first) playRow(first);
  };

  /** Track ids of the selected rows, in the order shown. */
  const selectedTrackIds = () =>
    rows.filter((row) => selection.ids.has(row.id)).map((row) => row.original.id);
  const fromMenu = (action: (trackIds: string[]) => void) => () => {
    setMenu(null);
    action(selectedTrackIds());
  };
  const clearSelection = () => setSelection({ ids: new Set(), anchor: null });

  const onRowClick = useCallback(
    (event: MouseEvent, id: string) => {
      const { selection: current, order: rowOrder, isMobile: touch } = latest.current;
      if (touch) {
        // Phones: a tap plays; once rows are selected (long press, ⋮), taps add or remove rows.
        if (current.ids.size === 0) return playRow(id);
        setSelection(clickSelection(current, rowOrder, id, { range: false, toggle: true }));
        return;
      }
      setSelection(
        clickSelection(current, rowOrder, id, {
          range: event.shiftKey,
          toggle: event.ctrlKey || event.metaKey,
        }),
      );
    },
    [setSelection, playRow],
  );

  const onRowContextMenu = useCallback(
    (event: MouseEvent, id: string) => {
      event.preventDefault();
      if (!latest.current.selection.ids.has(id)) setSelection({ ids: new Set([id]), anchor: id });
      setMenu({ top: event.clientY, left: event.clientX });
    },
    [setSelection],
  );

  /** The ⋮ button of a row (phones): the same menu, under the button. */
  const onRowMenu = useCallback(
    (event: MouseEvent, id: string) => {
      event.stopPropagation();
      if (!latest.current.selection.ids.has(id)) setSelection({ ids: new Set([id]), anchor: id });
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({ top: rect.bottom, left: rect.left });
    },
    [setSelection],
  );

  const onKeyDown = (event: KeyboardEvent) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setSelection({ ids: new Set(order), anchor: order[0] ?? null });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelected();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      playSelected();
    } else if (event.key === 'Escape') {
      setSelection({ ids: new Set(), anchor: null });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const moved = moveSelection(
        selection,
        order,
        event.key === 'ArrowDown' ? 1 : -1,
        event.shiftKey,
      );
      if (moved) {
        setSelection(moved.selection);
        virtualizer.scrollToIndex(moved.focusIndex, { align: 'auto' });
      }
    }
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', minHeight: 0 }}>
      <Box
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        sx={{
          minHeight: 0,
          overflow: 'auto',
          position: 'relative',
          outline: 'none',
          '&:focus-visible': {
            boxShadow: (theme) => `inset 0 0 0 2px ${theme.palette.primary.main}`,
          },
        }}
      >
        <Table
          stickyHeader
          size="small"
          role="grid"
          aria-label="Tracks"
          aria-multiselectable
          aria-rowcount={rows.length + 1}
          sx={{ display: 'grid', width: isMobile ? '100%' : totalWidth, minWidth: '100%' }}
        >
          <TableHead sx={{ display: 'grid', position: 'sticky', top: 0, zIndex: 1 }}>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} sx={{ display: 'flex', width: '100%' }}>
                {group.headers.map((header, i) => {
                  const sorted = header.column.getIsSorted();
                  const grows = isMobile ? i === 0 : i === group.headers.length - 1;
                  return (
                    <TableCell
                      key={header.id}
                      sortDirection={sorted || false}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        position: 'relative',
                        width: header.getSize(),
                        flex: growFlex(grows, isMobile),
                        minWidth: 0,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                      }}
                    >
                      <TableSortLabel
                        active={sorted !== false}
                        direction={sorted || 'asc'}
                        onClick={header.column.getToggleSortingHandler()}
                        sx={{ minWidth: 0, overflow: 'hidden' }}
                      >
                        <table.FlexRender header={header} />
                      </TableSortLabel>
                      {!isMobile && (
                        <Box
                          aria-hidden
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() => header.column.resetSize()}
                          sx={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            height: '100%',
                            width: 6,
                            cursor: 'col-resize',
                            touchAction: 'none',
                            bgcolor: header.column.getIsResizing() ? 'primary.main' : 'transparent',
                            '&:hover': { bgcolor: 'divider' },
                          }}
                        />
                      )}
                    </TableCell>
                  );
                })}
                {isMobile && (
                  <TableCell sx={{ width: MENU_CELL_WIDTH, flex: 'none', p: 0 }}>
                    <Box component="span" sx={VISUALLY_HIDDEN}>
                      Actions
                    </Box>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableHead>
          <TableBody
            sx={{ display: 'grid', height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <TrackRow
                  key={row.id}
                  row={row}
                  index={item.index}
                  start={item.start}
                  selected={selection.ids.has(row.id)}
                  current={isCurrent(row) ? (isPlaying ? 'playing' : 'paused') : null}
                  sizes={columnSizesKey}
                  onClick={onRowClick}
                  onDoubleClick={playRow}
                  onDragStart={onRowDragStart}
                  onContextMenu={onRowContextMenu}
                  compact={isMobile}
                  onMenu={onRowMenu}
                />
              );
            })}
          </TableBody>
        </Table>
        {rows.length === 0 && <EmptyState view={view} loading={playlistLoading} />}
      </Box>
      {isMobile && hasSelection && (
        <SelectionBar
          count={selection.ids.size}
          onPlay={playSelected}
          onQueue={() => addTracksToQueue(selectedTrackIds())}
          onPlaylist={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setPlaylistMenu({ top: rect.top, left: rect.left });
          }}
          onClear={clearSelection}
        />
      )}
      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ?? undefined}
      >
        <MenuItem onClick={playSelected} disabled={!hasSelection}>
          <ListItemIcon>
            <PlayIcon fontSize="small" />
          </ListItemIcon>
          Play
        </MenuItem>
        <MenuItem onClick={fromMenu(playTracksNext)} disabled={!hasSelection}>
          <ListItemIcon>
            <PlayNextIcon fontSize="small" />
          </ListItemIcon>
          Play next
        </MenuItem>
        {!isQueue && (
          <MenuItem onClick={fromMenu(addTracksToQueue)} disabled={!hasSelection}>
            <ListItemIcon>
              <QueueIcon fontSize="small" />
            </ListItemIcon>
            Add to queue
          </MenuItem>
        )}
        <MenuItem
          disabled={!hasSelection}
          onClick={() => {
            setPlaylistMenu(menu);
            setMenu(null);
          }}
        >
          <ListItemIcon>
            <PlaylistAddIcon fontSize="small" />
          </ListItemIcon>
          Add to playlist…
        </MenuItem>
        {!isDynamic && (
          <MenuItem onClick={removeSelected} disabled={!canRemove}>
            <ListItemIcon>
              <RemoveIcon fontSize="small" />
            </ListItemIcon>
            {removeLabel(isQueue, playlistId !== null)}
            {selection.ids.size > 1 ? ` (${selection.ids.size})` : ''}
          </MenuItem>
        )}
      </Menu>
      <AddToPlaylistMenu
        position={playlistMenu}
        trackIds={playlistMenu ? selectedTrackIds() : []}
        onClose={() => setPlaylistMenu(null)}
      />
    </Box>
  );
}

interface TrackRowProps {
  row: Row<typeof features, Track>;
  index: number;
  start: number;
  selected: boolean;
  /** This row is the current track. */
  current: 'playing' | 'paused' | null;
  /** Column widths, so the row re-renders when a column is resized. */
  sizes: string;
  onClick(event: MouseEvent, id: string): void;
  onDoubleClick(id: string): void;
  onDragStart(event: DragEvent, id: string): void;
  onContextMenu(event: MouseEvent, id: string): void;
  /** Phone layout: two-line title, a ⋮ button, no drag. */
  compact: boolean;
  onMenu(event: MouseEvent, id: string): void;
}

/** How a column takes the free width: the last one on desktop, the title on phones. */
function growFlex(grows: boolean, compact: boolean): string {
  if (!grows) return 'none';
  return compact ? '1 1 0' : '1 0 auto';
}

const TrackRow = memo(function TrackRow({
  row,
  index,
  start,
  selected,
  current,
  onClick,
  onDoubleClick,
  onDragStart,
  onContextMenu,
  compact,
  onMenu,
}: TrackRowProps) {
  const cells = row.getAllCells();
  const track = row.original;
  return (
    <TableRow
      hover
      selected={selected}
      aria-selected={selected}
      aria-rowindex={index + 2}
      aria-current={current ? 'true' : undefined}
      onClick={(event) => onClick(event, row.id)}
      // Phones play on a single tap.
      onDoubleClick={compact ? undefined : () => onDoubleClick(row.id)}
      draggable={!compact}
      onDragStart={compact ? undefined : (event) => onDragStart(event, row.id)}
      onDragEnd={compact ? undefined : endTrackDrag}
      onContextMenu={(event) => onContextMenu(event, row.id)}
      sx={{
        display: 'flex',
        position: 'absolute',
        width: '100%',
        height: compact ? MOBILE_ROW_HEIGHT : ROW_HEIGHT,
        transform: `translateY(${start}px)`,
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      {cells.map((cell, i) => (
        <TableCell
          key={cell.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            width: cell.column.getSize(),
            flex: growFlex(compact ? i === 0 : i === cells.length - 1, compact),
            minWidth: 0,
            overflow: 'hidden',
            borderBottom: 'none',
          }}
        >
          {compact && cell.column.id === 'title' ? (
            <CompactTitle track={track} current={current} />
          ) : (
            <CellContent cell={cell} first={i === 0} current={current} />
          )}
        </TableCell>
      ))}
      {compact && (
        <TableCell sx={{ width: MENU_CELL_WIDTH, flex: 'none', p: 0, borderBottom: 'none' }}>
          <IconButton
            aria-label={`More actions for ${track.title}`}
            onClick={(event) => onMenu(event, row.id)}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <MoreIcon />
          </IconButton>
        </TableCell>
      )}
    </TableRow>
  );
});

type Current = TrackRowProps['current'];

/** The speaker shown on the current track: dimmed while paused. */
function NowPlaying({ current, size }: Readonly<{ current: 'playing' | 'paused'; size: number }>) {
  return (
    <NowPlayingIcon
      aria-label={current === 'playing' ? 'Playing' : 'Paused'}
      color="primary"
      sx={{
        fontSize: size,
        flex: 'none',
        verticalAlign: 'middle',
        opacity: current === 'paused' ? 0.6 : 1,
      }}
    />
  );
}

/** A desktop cell: its value, ellipsised; the speaker in the first column of the current row. */
function CellContent({
  cell,
  first,
  current,
}: Readonly<{
  cell: ReturnType<Row<typeof features, Track>['getAllCells']>[number];
  first: boolean;
  current: Current;
}>) {
  return (
    <Box
      component="span"
      sx={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontWeight: current ? 600 : undefined,
        color: current ? 'primary.main' : undefined,
      }}
    >
      {first && current ? (
        <NowPlaying current={current} size={16} />
      ) : (
        flexRender(cell.column.columnDef.cell, cell.getContext())
      )}
    </Box>
  );
}

/** Phone rows: the title over "artist · album". */
function CompactTitle({ track, current }: Readonly<{ track: Track; current: Current }>) {
  const subtitle = [track.artist, track.album].filter(Boolean).join(' · ');
  return (
    <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
      {current && <NowPlaying current={current} size={18} />}
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="body2"
          noWrap
          sx={{ fontWeight: current ? 600 : 500, color: current ? 'primary.main' : undefined }}
        >
          {track.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {subtitle}
        </Typography>
      </Box>
    </Box>
  );
}

interface SelectionBarProps {
  count: number;
  onPlay(): void;
  onQueue(): void;
  onPlaylist(event: MouseEvent<HTMLElement>): void;
  onClear(): void;
}

/** Phones: what to do with the selected rows (instead of dragging them to the sidebar). */
function SelectionBar({
  count,
  onPlay,
  onQueue,
  onPlaylist,
  onClear,
}: Readonly<SelectionBarProps>) {
  return (
    <Box
      role="toolbar"
      aria-label="Selected tracks"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'action.selected',
      }}
    >
      <IconButton aria-label="Clear selection" size="small" onClick={onClear}>
        <CloseIcon fontSize="small" />
      </IconButton>
      <Typography variant="body2" sx={{ flex: 1 }} noWrap>
        {count} selected
      </Typography>
      <Button size="small" startIcon={<PlayIcon />} onClick={onPlay}>
        Play
      </Button>
      <Divider orientation="vertical" flexItem />
      <IconButton aria-label="Add to queue" size="small" onClick={onQueue}>
        <QueueIcon fontSize="small" />
      </IconButton>
      <IconButton aria-label="Add to playlist" size="small" onClick={onPlaylist}>
        <PlaylistAddIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

function removeLabel(isQueue: boolean, isPlaylist: boolean): string {
  if (isQueue) return 'Remove from queue';
  if (isPlaylist) return 'Remove from playlist';
  return 'Remove from results';
}

function EmptyState({ view, loading }: { view: string; loading: boolean }) {
  const status = useCatalogStore((state) => state.status);
  const error = useCatalogStore((state) => state.error);
  let content: React.ReactNode;
  if (view === 'queue') content = 'The queue is empty. Double-click a track to play it.';
  else if (view.startsWith('dynamic:')) content = 'No tracks match this smart playlist.';
  else if (view !== 'filter')
    content = loading ? (
      <CircularProgress size={24} aria-label="Loading playlist" />
    ) : (
      'This playlist is empty. Drag tracks onto it in the sidebar.'
    );
  else if (status === 'loading')
    content = <CircularProgress size={24} aria-label="Loading library" />;
  else if (status === 'waiting') content = 'Waiting for the first library sync with Navidrome…';
  else if (status === 'error') content = `Could not load the library: ${error ?? 'unknown error'}`;
  else content = 'No tracks match the filters.';
  return (
    <Typography
      component="div"
      role="status"
      color="text.secondary"
      variant="body2"
      sx={{ py: 4, textAlign: 'center' }}
    >
      {content}
    </Typography>
  );
}
