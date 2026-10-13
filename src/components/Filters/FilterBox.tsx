'use client';

import { useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import ListItemButton from '@mui/material/ListItemButton';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ClearIcon from '@mui/icons-material/FilterListOff';
import SearchIcon from '@mui/icons-material/Search';
import {
  tracksForValues,
  type FacetOption,
  type FilterLevel,
  type Filters,
} from '@/client/catalog/facets';
import { endTrackDrag, startTrackDrag } from '@/client/dnd';
import { formatCount } from '@/client/format';
import { clickSelection } from '@/client/selection';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useFilterStore } from '@/client/stores/filterStore';

const ROW_HEIGHT = 30;

export interface FilterBoxProps<L extends FilterLevel> {
  level: L;
  title: string;
  options: FacetOption<Filters[L][number]>[];
  selected: Filters[L];
  /** Tracks this box chooses from (shown on the "All" entry). */
  total: number;
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * One multi-select box of the cascading filters (PLAN.md §7.3). Nothing selected = all.
 * Selection works like a desktop list: click selects one value, Ctrl/Cmd-click toggles,
 * Shift-click selects a range (in the order shown). Values can be dragged to the sidebar: the
 * selected values when dragging one of them, otherwise the dragged value alone.
 */
export default function FilterBox<L extends FilterLevel>({
  level,
  title,
  options,
  selected,
  total,
}: FilterBoxProps<L>) {
  const setLevel = useFilterStore((state) => state.setLevel);
  const [query, setQuery] = useState('');
  /** Fixed end of Shift ranges: the last value clicked without Shift. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set<string | number>(selected), [selected]);
  const selectedKeys = useMemo(() => new Set(selected.map(String)), [selected]);
  const visible = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options;
    return options.filter((option) =>
      normalize(`${option.label} ${option.secondary ?? ''}`).includes(q),
    );
  }, [options, query]);
  // Row 0 is "All" (clears the selection), hidden while searching.
  const showAll = query.trim() === '';
  const count = visible.length + (showAll ? 1 : 0);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const clear = () => {
    setAnchor(null);
    setLevel(level, [] as unknown as Filters[L]);
  };

  const onDragStart = (event: DragEvent, option: FacetOption<Filters[L][number]>) => {
    const catalog = useCatalogStore.getState().catalog;
    if (!catalog) return event.preventDefault();
    const dragged = selectedSet.has(option.value)
      ? options.filter((o) => selectedSet.has(o.value))
      : [option];
    const values = dragged.map((o) => o.value) as Filters[L];
    const filters = useFilterStore.getState().filters;
    const trackIds = tracksForValues(catalog, filters, level, values).map((t) => t.id);
    if (trackIds.length === 0) return event.preventDefault();
    // A playlist created from this drop is named after the values.
    const name = dragged.length <= 3 ? dragged.map((o) => o.label).join(', ') : null;
    startTrackDrag(event.dataTransfer, trackIds, name);
  };

  const select = (event: MouseEvent, option: FacetOption<Filters[L][number]>) => {
    const next = clickSelection(
      { ids: selectedKeys, anchor },
      visible.map((o) => String(o.value)),
      String(option.value),
      { range: event.shiftKey, toggle: event.ctrlKey || event.metaKey },
    );
    setAnchor(next.anchor);
    // Keep the box's order; values hidden by the search stay selected only with Ctrl.
    const values = options.filter((o) => next.ids.has(String(o.value))).map((o) => o.value);
    setLevel(level, values as Filters[L]);
  };

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label={title}
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pl: 1.5,
          pr: 0.5,
          minHeight: 36,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="subtitle2" sx={{ flex: 1 }} noWrap>
          {title}
          {selected.length > 0 && (
            <Typography component="span" variant="caption" color="primary" sx={{ ml: 1 }}>
              {selected.length} selected
            </Typography>
          )}
        </Typography>
        {selected.length > 0 && (
          <Tooltip title="Clear selection">
            <IconButton size="small" aria-label={`Clear ${title} selection`} onClick={clear}>
              <ClearIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <SearchIcon fontSize="small" color="action" />
        <InputBase
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          inputProps={{ 'aria-label': `Search ${title}` }}
          sx={{ flex: 1, fontSize: 14 }}
        />
      </Box>
      <Box
        ref={scrollRef}
        role="listbox"
        aria-label={title}
        aria-multiselectable
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        <Box sx={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const isAll = showAll && item.index === 0;
            const option = isAll ? null : visible[item.index - (showAll ? 1 : 0)];
            if (!isAll && !option) return null;
            const isSelected = isAll ? selected.length === 0 : selectedSet.has(option!.value);
            const label = isAll ? 'All' : option!.label;
            return (
              <ListItemButton
                key={isAll ? '__all__' : String(option!.value)}
                role="option"
                aria-selected={isSelected}
                dense
                selected={isSelected}
                onClick={(event) => (isAll ? clear() : select(event, option!))}
                draggable={!isAll}
                onDragStart={isAll ? undefined : (event) => onDragStart(event, option!)}
                onDragEnd={isAll ? undefined : endTrackDrag}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: ROW_HEIGHT,
                  transform: `translateY(${item.start}px)`,
                  px: 1.5,
                  gap: 0.5,
                  userSelect: 'none',
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: isAll ? 500 : undefined }}>
                    {label}
                  </Typography>
                  {option?.secondary && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {option.secondary}
                    </Typography>
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ pr: 1 }}>
                  {formatCount(isAll ? total : option!.count)}
                </Typography>
              </ListItemButton>
            );
          })}
        </Box>
      </Box>
    </Paper>
  );
}
