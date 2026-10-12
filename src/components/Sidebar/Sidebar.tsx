'use client';

import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Typography from '@mui/material/Typography';
import FilterListIcon from '@mui/icons-material/FilterList';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import { formatCount } from '@/client/format';
import { usePlayerStore } from '@/client/stores/playerStore';
import { useSelectionStore } from '@/client/stores/selectionStore';
import { useViewStore, type ActiveView } from '@/client/stores/viewStore';

/** Sidebar with the two fixed entries. Custom playlists arrive in M9. */
export default function Sidebar() {
  const activeView = useViewStore((state) => state.activeView);
  const setActiveView = useViewStore((state) => state.setActiveView);
  const clearSelection = useSelectionStore((state) => state.clear);
  const queueLength = usePlayerStore((state) => state.queue.length);
  const show = (view: ActiveView) => {
    if (view !== activeView) clearSelection();
    setActiveView(view);
  };

  return (
    <List dense disablePadding>
      <ListItemButton selected={activeView === 'queue'} onClick={() => show('queue')}>
        <ListItemIcon>
          <QueueMusicIcon />
        </ListItemIcon>
        <ListItemText primary="Currently playing" />
        {queueLength > 0 && (
          <Typography variant="caption" color="text.secondary">
            {formatCount(queueLength)}
          </Typography>
        )}
      </ListItemButton>
      <ListItemButton selected={activeView === 'filter'} onClick={() => show('filter')}>
        <ListItemIcon>
          <FilterListIcon />
        </ListItemIcon>
        <ListItemText primary="Filter results" />
      </ListItemButton>
      <Divider />
      <ListSubheader>Playlists</ListSubheader>
      <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
        Drop tracks here to create a playlist
      </Typography>
    </List>
  );
}
