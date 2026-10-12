'use client';

import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import ListItemButton from '@mui/material/ListItemButton';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ClearIcon from '@mui/icons-material/FilterListOff';
import SearchIcon from '@mui/icons-material/Search';
import type { FacetOption, FilterLevel, Filters } from '@/client/catalog/facets';
import { formatCount } from '@/client/format';
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

/** One multi-select box of the cascading filters (PLAN.md §7.3). Nothing selected = all. */
export default function FilterBox<L extends FilterLevel>({
  level,
  title,
  options,
  selected,
  total,
}: FilterBoxProps<L>) {
  const toggle = useFilterStore((state) => state.toggle);
  const setLevel = useFilterStore((state) => state.setLevel);
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set<string | number>(selected), [selected]);
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

  const clear = () => setLevel(level, [] as unknown as Filters[L]);

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
                onClick={() => (isAll ? clear() : toggle(level, option!.value))}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: ROW_HEIGHT,
                  transform: `translateY(${item.start}px)`,
                  px: 0.5,
                  gap: 0.5,
                }}
              >
                <Checkbox
                  size="small"
                  checked={isSelected}
                  tabIndex={-1}
                  disableRipple
                  sx={{ p: 0.5 }}
                  slotProps={{ input: { 'aria-hidden': true } }}
                />
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
