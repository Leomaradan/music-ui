'use client';

import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { flexRender, useTable, type Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
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
import RemoveIcon from '@mui/icons-material/PlaylistRemove';
import type { Track } from '@/client/catalog/decode';
import { useTableTracks } from '@/client/hooks';
import { clickSelection, moveSelection } from '@/client/selection';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { useSelectionStore } from '@/client/stores/selectionStore';
import { useViewStore, type SortEntry } from '@/client/stores/viewStore';
import { columns, features } from './columns';

export const ROW_HEIGHT = 32;

type Updater<T> = T | ((previous: T) => T);
const resolve = <T,>(updater: Updater<T>, previous: T): T =>
  typeof updater === 'function' ? (updater as (previous: T) => T)(previous) : updater;

/**
 * Virtualized track table (PLAN.md §7.4): sortable and resizable columns, multi-select
 * (click, Ctrl/Cmd, Shift, Ctrl+A, arrows), Delete / context menu to remove tracks from
 * the filter results.
 */
export default function TrackTable() {
  const data = useTableTracks();
  const view = useViewStore((state) => state.activeView);
  const sorting = useViewStore((state) => state.sorting);
  const columnSizing = useViewStore((state) => state.columnSizing);
  const selection = useSelectionStore((state) => state.selection);
  const setSelection = useSelectionStore((state) => state.setSelection);
  const exclude = useFilterStore((state) => state.exclude);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (track) => track.id,
    state: { sorting, columnSizing },
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
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 15,
  });

  const canRemove = view === 'filter' && selection.ids.size > 0;
  const removeSelected = () => {
    if (canRemove) exclude(selection.ids);
    setMenu(null);
  };

  // Row handlers read the latest state through a ref so they stay stable and memoized
  // rows only re-render when their own props change (smooth scrolling on large lists).
  const latest = useRef({ selection, order });
  latest.current = { selection, order };

  const onRowClick = useCallback(
    (event: MouseEvent, id: string) => {
      const { selection: current, order: rowOrder } = latest.current;
      setSelection(
        clickSelection(current, rowOrder, id, {
          range: event.shiftKey,
          toggle: event.ctrlKey || event.metaKey,
        }),
      );
    },
    [setSelection],
  );

  const onRowContextMenu = useCallback(
    (event: MouseEvent, id: string) => {
      event.preventDefault();
      if (!latest.current.selection.ids.has(id)) setSelection({ ids: new Set([id]), anchor: id });
      setMenu({ top: event.clientY, left: event.clientX });
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
        sx={{ display: 'grid', width: totalWidth, minWidth: '100%' }}
      >
        <TableHead sx={{ display: 'grid', position: 'sticky', top: 0, zIndex: 1 }}>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} sx={{ display: 'flex', width: '100%' }}>
              {group.headers.map((header, i) => {
                const sorted = header.column.getIsSorted();
                const isLast = i === group.headers.length - 1;
                return (
                  <TableCell
                    key={header.id}
                    sortDirection={sorted || false}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      position: 'relative',
                      width: header.getSize(),
                      flex: isLast ? '1 0 auto' : 'none',
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
                  </TableCell>
                );
              })}
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
                sizes={columnSizesKey}
                onClick={onRowClick}
                onContextMenu={onRowContextMenu}
              />
            );
          })}
        </TableBody>
      </Table>
      {rows.length === 0 && <EmptyState view={view} />}
      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ?? undefined}
      >
        <MenuItem onClick={removeSelected} disabled={!canRemove}>
          <ListItemIcon>
            <RemoveIcon fontSize="small" />
          </ListItemIcon>
          Remove from results{selection.ids.size > 1 ? ` (${selection.ids.size})` : ''}
        </MenuItem>
      </Menu>
    </Box>
  );
}

interface TrackRowProps {
  row: Row<typeof features, Track>;
  index: number;
  start: number;
  selected: boolean;
  /** Column widths, so the row re-renders when a column is resized. */
  sizes: string;
  onClick(event: MouseEvent, id: string): void;
  onContextMenu(event: MouseEvent, id: string): void;
}

const TrackRow = memo(function TrackRow({
  row,
  index,
  start,
  selected,
  onClick,
  onContextMenu,
}: TrackRowProps) {
  const cells = row.getAllCells();
  return (
    <TableRow
      hover
      selected={selected}
      aria-selected={selected}
      aria-rowindex={index + 2}
      onClick={(event) => onClick(event, row.id)}
      onContextMenu={(event) => onContextMenu(event, row.id)}
      sx={{
        display: 'flex',
        position: 'absolute',
        width: '100%',
        height: ROW_HEIGHT,
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
            flex: i === cells.length - 1 ? '1 0 auto' : 'none',
            overflow: 'hidden',
            borderBottom: 'none',
          }}
        >
          <Box
            component="span"
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </Box>
        </TableCell>
      ))}
    </TableRow>
  );
});

function EmptyState({ view }: { view: string }) {
  const status = useCatalogStore((state) => state.status);
  const error = useCatalogStore((state) => state.error);
  let content: React.ReactNode;
  if (view === 'queue')
    content = 'Nothing is playing. The play queue arrives with the player (M8).';
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
