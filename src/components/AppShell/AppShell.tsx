import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import CatalogLoader from '@/components/CatalogLoader/CatalogLoader';
import Filters from '@/components/Filters/Filters';
import Notifier from '@/components/Notifier/Notifier';
import PlayerBar from '@/components/PlayerBar/PlayerBar';
import PlayerHost from '@/components/PlayerHost/PlayerHost';
import SettingsDialog from '@/components/SettingsDialog/SettingsDialog';
import Sidebar from '@/components/Sidebar/Sidebar';
import StatusBar from '@/components/StatusBar/StatusBar';
import TrackTable from '@/components/TrackTable/TrackTable';

export const SIDEBAR_WIDTH = 260;
export const FILTERS_HEIGHT = 260;

/** Page layout from PLAN.md §7: player bar on top, sidebar left, filters + track table right. */
export default function AppShell() {
  return (
    <Box
      sx={{
        height: '100dvh',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`,
        gridTemplateAreas: '"player player" "sidebar main"',
        overflow: 'hidden',
      }}
    >
      <CatalogLoader />
      <PlayerHost />
      <Notifier />
      <SettingsDialog />
      <Box sx={{ gridArea: 'player' }}>
        <PlayerBar />
      </Box>
      <Box
        component="nav"
        sx={{ gridArea: 'sidebar', borderRight: 1, borderColor: 'divider', minHeight: 0 }}
      >
        <Sidebar />
      </Box>
      <Box
        component="main"
        sx={{
          gridArea: 'main',
          display: 'grid',
          gridTemplateRows: `${FILTERS_HEIGHT}px auto 1fr auto`,
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <Filters />
        <Divider />
        <TrackTable />
        <StatusBar />
      </Box>
    </Box>
  );
}
