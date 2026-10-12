import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import FilterListIcon from '@mui/icons-material/FilterList';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';

/** Sidebar with the two fixed entries. Custom playlists arrive in M9. */
export default function Sidebar() {
  return (
    <List dense disablePadding>
      <ListItemButton>
        <ListItemIcon>
          <QueueMusicIcon />
        </ListItemIcon>
        <ListItemText primary="Currently playing" />
      </ListItemButton>
      <ListItemButton selected>
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
