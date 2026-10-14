'use client';

import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import { useIsMobile } from '@/client/hooks';
import { useUiStore } from '@/client/stores/uiStore';
import CatalogLoader from '@/components/CatalogLoader/CatalogLoader';
import DynamicPlaylistDialog from '@/components/DynamicPlaylistDialog/DynamicPlaylistDialog';
import Filters from '@/components/Filters/Filters';
import MobileFilters from '@/components/Filters/MobileFilters';
import Notifier from '@/components/Notifier/Notifier';
import PlayerBar from '@/components/PlayerBar/PlayerBar';
import PlayerHost from '@/components/PlayerHost/PlayerHost';
import SettingsDialog from '@/components/SettingsDialog/SettingsDialog';
import Sidebar from '@/components/Sidebar/Sidebar';
import StatusBar from '@/components/StatusBar/StatusBar';
import TrackTable from '@/components/TrackTable/TrackTable';

export const SIDEBAR_WIDTH = 260;
export const FILTERS_HEIGHT = 260;

/**
 * Page layout from PLAN.md §7: player bar on top, sidebar left, filters + track table right.
 * On phones (§7.6): one column, the sidebar in a drawer and the filters in a dialog.
 */
export default function AppShell() {
  const isMobile = useIsMobile();
  const navOpen = useUiStore((state) => state.navOpen);
  const sidebar = <Sidebar />;

  return (
    <Box
      sx={{
        height: '100dvh',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gridTemplateColumns: isMobile ? '1fr' : `${SIDEBAR_WIDTH}px 1fr`,
        gridTemplateAreas: isMobile ? '"player" "main"' : '"player player" "sidebar main"',
        overflow: 'hidden',
      }}
    >
      <CatalogLoader />
      <PlayerHost />
      <Notifier />
      <SettingsDialog />
      <DynamicPlaylistDialog />
      <Box sx={{ gridArea: 'player', minWidth: 0 }}>
        <PlayerBar />
      </Box>
      {isMobile ? (
        <Drawer
          open={navOpen}
          onClose={() => useUiStore.getState().setNavOpen(false)}
          slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH + 20 } } }}
        >
          <Box component="nav" sx={{ height: '100%' }}>
            {sidebar}
          </Box>
        </Drawer>
      ) : (
        <Box
          component="nav"
          sx={{ gridArea: 'sidebar', borderRight: 1, borderColor: 'divider', minHeight: 0 }}
        >
          {sidebar}
        </Box>
      )}
      <Box
        component="main"
        sx={{
          gridArea: 'main',
          display: 'grid',
          gridTemplateRows: isMobile ? 'auto auto 1fr auto' : `${FILTERS_HEIGHT}px auto 1fr auto`,
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {isMobile ? <MobileFilters /> : <Filters />}
        <Divider />
        <TrackTable />
        <StatusBar />
      </Box>
    </Box>
  );
}
