import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

/** Track table columns (PLAN.md §7.4). */
export const TRACK_COLUMNS = [
  '#',
  'Title',
  'Artist',
  'Album',
  'Genre',
  'Year',
  'Duration',
  'Folder',
  'Format',
] as const;

/** Static track table. Virtualization, sorting and selection arrive in M7. */
export default function TrackTable() {
  return (
    <TableContainer sx={{ minHeight: 0, overflow: 'auto' }}>
      <Table stickyHeader size="small" aria-label="Tracks">
        <TableHead>
          <TableRow>
            {TRACK_COLUMNS.map((column) => (
              <TableCell key={column}>{column}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell
              colSpan={TRACK_COLUMNS.length}
              align="center"
              sx={{ color: 'text.secondary', py: 4 }}
            >
              The track list is not wired to the catalog yet (M5–M7). The synced library is visible
              at /api/catalog/status.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}
