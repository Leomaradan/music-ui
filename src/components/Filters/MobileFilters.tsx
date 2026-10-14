'use client';

import { useState } from 'react';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/FilterListOff';
import { FILTER_LEVELS, type FilterLevel } from '@/client/catalog/facets';
import { formatCount } from '@/client/format';
import { useFacets } from '@/client/hooks';
import { useFilterStore } from '@/client/stores/filterStore';
import { useUiStore } from '@/client/stores/uiStore';
import FilterBox from './FilterBox';
import { FILTER_BOXES } from './Filters';

const clearAll = () => useFilterStore.getState().setLevel(FILTER_LEVELS[0]!, []);
const setOpen = (open: boolean) => useUiStore.getState().setFiltersOpen(open);

/**
 * Phones: the four filter boxes do not fit above the table. A bar shows how many are in use
 * and opens a full-screen dialog with one box per tab (same cascade, tap to add or remove).
 */
export default function MobileFilters() {
  const filters = useFilterStore((state) => state.filters);
  const active = FILTER_LEVELS.filter((level) => filters[level].length > 0).length;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, minWidth: 0 }}>
      <Button
        size="small"
        onClick={() => setOpen(true)}
        startIcon={
          <Badge badgeContent={active} color="primary" variant="dot">
            <FilterListIcon />
          </Badge>
        }
      >
        Filters
      </Button>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
        {active === 0 ? 'Whole library' : `${active} in use`}
      </Typography>
      {active > 0 && (
        <IconButton size="small" aria-label="Clear all filters" onClick={clearAll}>
          <ClearIcon fontSize="small" />
        </IconButton>
      )}
      <FiltersDialog />
    </Box>
  );
}

function FiltersDialog() {
  const open = useUiStore((state) => state.filtersOpen);
  const facets = useFacets();
  const filters = useFilterStore((state) => state.filters);
  const [tab, setTab] = useState<FilterLevel>('folders');
  const box = FILTER_BOXES.find((b) => b.level === tab) ?? FILTER_BOXES[0]!;
  const matching = facets?.tracks.length ?? 0;

  return (
    <Dialog fullScreen open={open} onClose={() => setOpen(false)} aria-labelledby="filters-title">
      <DialogTitle
        id="filters-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}
      >
        Filters
        <IconButton aria-label="Close filters" onClick={() => setOpen(false)} edge="end">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, value: FilterLevel) => setTab(value)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        {FILTER_BOXES.map(({ level, title }) => (
          <Tab
            key={level}
            value={level}
            label={filters[level].length ? `${title} (${filters[level].length})` : title}
          />
        ))}
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0, display: 'grid', p: 1 }}>
        <FilterBox
          key={box.level}
          level={box.level}
          title={box.title}
          options={facets?.[box.level] ?? []}
          selected={filters[box.level]}
          total={facets?.totals[box.level] ?? 0}
          touch
        />
      </Box>
      <DialogActions>
        <Button onClick={clearAll}>Clear all</Button>
        <Button variant="contained" onClick={() => setOpen(false)}>
          Show {formatCount(matching)} {matching === 1 ? 'track' : 'tracks'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
