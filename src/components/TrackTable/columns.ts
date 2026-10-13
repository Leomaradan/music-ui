import {
  columnResizingFeature,
  columnSizingFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table';
import type { Track } from '@/client/catalog/decode';
import { formatDuration } from '@/client/format';

export const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnSizingFeature,
  columnResizingFeature,
});

const helper = createColumnHelper<typeof features, Track>();
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

type Row = { original: Track };

/** Ascending comparators (the table reverses them for descending sorts). */
const byText = (get: (track: Track) => string) => (a: Row, b: Row) =>
  collator.compare(get(a.original), get(b.original));

/** Numbers ascending, missing values last. */
const byNumber = (get: (track: Track) => number | null) => (a: Row, b: Row) => {
  const x = get(a.original);
  const y = get(b.original);
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return x - y;
};

const genreText = (track: Track) => track.genres.join(', ');
const formatText = (track: Track) =>
  [track.suffix, track.bitRate ? `${track.bitRate} kbps` : null].filter(Boolean).join(' · ');

/** Track table columns (PLAN.md §7.4). */
export const columns = helper.columns([
  helper.accessor('track', {
    header: '#',
    size: 56,
    minSize: 40,
    sortFn: byNumber((t) => (t.track === null ? null : (t.disc ?? 0) * 10_000 + t.track)),
    cell: (info) => info.getValue() ?? '',
  }),
  helper.accessor('title', { header: 'Title', size: 240, sortFn: byText((t) => t.title) }),
  helper.accessor('artist', { header: 'Artist', size: 180, sortFn: byText((t) => t.artist) }),
  helper.accessor('album', { header: 'Album', size: 200, sortFn: byText((t) => t.album) }),
  helper.accessor(genreText, {
    id: 'genre',
    header: 'Genre',
    size: 130,
    sortFn: byText(genreText),
  }),
  helper.accessor('year', {
    header: 'Year',
    size: 70,
    minSize: 50,
    sortFn: byNumber((t) => t.year),
    cell: (info) => info.getValue() ?? '',
  }),
  helper.accessor('duration', {
    header: 'Duration',
    size: 90,
    minSize: 60,
    sortFn: byNumber((t) => t.duration),
    cell: (info) => formatDuration(info.getValue()),
  }),
  helper.accessor('folderName', {
    id: 'folder',
    header: 'Folder',
    size: 120,
    sortFn: byText((t) => t.folderName),
  }),
  helper.accessor(formatText, {
    id: 'format',
    header: 'Format',
    size: 120,
    sortFn: byText(formatText),
  }),
]);
