'use client';

import Box from '@mui/material/Box';
import type { FilterLevel } from '@/client/catalog/facets';
import { useFacets } from '@/client/hooks';
import { useFilterStore } from '@/client/stores/filterStore';
import FilterBox from './FilterBox';

/** Cascade order of the filter boxes (PLAN.md §7.3). */
export const FILTER_BOXES: readonly { level: FilterLevel; title: string }[] = [
  { level: 'folders', title: 'Music Folder' },
  { level: 'genres', title: 'Genre' },
  { level: 'artists', title: 'Artist' },
  { level: 'albums', title: 'Album' },
];

/** The four cascading multi-select filter boxes. Always visible. */
export default function Filters() {
  const facets = useFacets();
  const filters = useFilterStore((state) => state.filters);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${FILTER_BOXES.length}, minmax(0, 1fr))`,
        gap: 1,
        p: 1,
        minHeight: 0,
      }}
    >
      {FILTER_BOXES.map(({ level, title }) => (
        <FilterBox
          key={level}
          level={level}
          title={title}
          options={facets?.[level] ?? []}
          selected={filters[level]}
          total={facets?.totals[level] ?? 0}
        />
      ))}
    </Box>
  );
}
