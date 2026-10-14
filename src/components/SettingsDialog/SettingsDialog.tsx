'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import SyncIcon from '@mui/icons-material/Sync';
import { api } from '@/client/api';
import { signOut } from '@/client/auth';
import { formatCount, formatRelativeTime } from '@/client/format';
import { SHORTCUTS } from '@/client/shortcuts';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { notify } from '@/client/stores/notificationStore';
import { useUiStore, type SettingsTab } from '@/client/stores/uiStore';
import { useViewStore } from '@/client/stores/viewStore';
import type { SyncStatus } from '@/lib/catalog/sync';

interface Health {
  status: 'ok' | 'degraded';
  subsonic: { reachable: boolean; server?: string; error?: string };
}

const POLL_MS = 1_000;

/** Settings (PLAN.md §12, M10): library status and rescan, appearance, keyboard shortcuts. */
export default function SettingsDialog() {
  const tab = useUiStore((state) => state.settings);
  const close = useUiStore((state) => state.closeSettings);
  const open = useUiStore((state) => state.openSettings);

  return (
    <Dialog
      open={tab !== null}
      onClose={close}
      fullWidth
      maxWidth="sm"
      aria-labelledby="settings-title"
    >
      <DialogTitle id="settings-title" sx={{ pb: 0 }}>
        Settings
      </DialogTitle>
      <Tabs
        value={tab ?? 'library'}
        onChange={(_, value: SettingsTab) => open(value)}
        sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Library" value="library" />
        <Tab label="Appearance" value="appearance" />
        <Tab label="Shortcuts" value="shortcuts" />
      </Tabs>
      <DialogContent sx={{ minHeight: 260 }}>
        {tab === 'library' && <LibraryTab />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'shortcuts' && <ShortcutsTab />}
      </DialogContent>
      <DialogActions>
        {tab !== null && <Account />}
        <Button onClick={close}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Signed in as …" and the sign-out button, when the login is enabled. */
function Account() {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    // State is only set once the server answers (fetching from an external system).
    void api<{ enabled: boolean; username: string | null }>('/api/auth/me')
      .then((me) => setUsername(me.enabled ? me.username : null))
      .catch(() => setUsername(null));
  }, []);

  if (!username) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto', pl: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Signed in as <strong>{username}</strong>
      </Typography>
      <Button size="small" onClick={() => void signOut()}>
        Sign out
      </Button>
    </Stack>
  );
}

function LibraryTab() {
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wasSyncing = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await api<SyncStatus>('/api/catalog/status');
      setStatus(next);
      // A sync just finished: load the new catalog in this browser.
      if (wasSyncing.current && next.state !== 'syncing') {
        if (next.state === 'idle') {
          await useCatalogStore.getState().revalidate();
          notify(`Library synced: ${formatCount(next.trackCount)} tracks`, 'success');
        }
      }
      wasSyncing.current = next.state === 'syncing';
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void api<Health>('/api/health')
      .then(setHealth)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    // State is only set once the server answers (fetching from an external system).
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshStatus();
  }, [refreshStatus]);

  // Poll while a sync runs.
  const syncing = status?.state === 'syncing';
  useEffect(() => {
    if (!syncing) return;
    const timer = setInterval(() => void refreshStatus(), POLL_MS);
    return () => clearInterval(timer);
  }, [syncing, refreshStatus]);

  const rescan = async () => {
    try {
      setStatus(await api<SyncStatus>('/api/catalog/rescan', { method: 'POST' }));
      wasSyncing.current = true;
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const progress = status?.progress;
  return (
    <Stack spacing={2.5} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Box>
        <Typography variant="overline" color="text.secondary">
          Navidrome
        </Typography>
        {health ? (
          health.subsonic.reachable ? (
            <Typography variant="body2">Connected · {health.subsonic.server}</Typography>
          ) : (
            <Alert severity="warning">Unreachable: {health.subsonic.error}</Alert>
          )
        ) : (
          <CircularProgress size={16} aria-label="Checking Navidrome" />
        )}
      </Box>

      <Box>
        <Typography variant="overline" color="text.secondary">
          Library
        </Typography>
        {status ? (
          <>
            <Typography variant="body2">
              {formatCount(status.trackCount)} tracks
              {status.lastSync && ` · synced ${formatRelativeTime(new Date(status.lastSync.at))}`}
            </Typography>
            {syncing && (
              <Typography variant="body2" color="text.secondary" role="status">
                Syncing
                {progress?.folder ? ` “${progress.folder}”` : ''}
                {progress
                  ? ` (${progress.foldersDone}/${progress.foldersTotal} folders, ${formatCount(progress.tracks)} tracks)`
                  : ''}
                …
              </Typography>
            )}
            {status.lastError && !syncing && (
              <Alert severity="error" sx={{ mt: 1 }}>
                Last sync failed {formatRelativeTime(new Date(status.lastError.at))}:{' '}
                {status.lastError.message}
              </Alert>
            )}
          </>
        ) : (
          <CircularProgress size={16} aria-label="Loading sync status" />
        )}
      </Box>

      <Box>
        <Button
          variant="outlined"
          startIcon={syncing ? <CircularProgress size={16} aria-hidden /> : <SyncIcon />}
          disabled={syncing || status === null}
          onClick={() => void rescan()}
        >
          {syncing ? 'Syncing…' : 'Rescan library'}
        </Button>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          Copies the whole library from Navidrome again. The app already checks for changes
          regularly; use this right after adding music, once Navidrome has scanned it.
        </Typography>
      </Box>
    </Stack>
  );
}

function resetLayout() {
  const view = useViewStore.getState();
  view.setSorting([]);
  view.setColumnSizing({});
  notify('Table sort and column widths reset', 'success');
}

function AppearanceTab() {
  const { mode, setMode } = useColorScheme();
  return (
    <Stack spacing={3} sx={{ pt: 1 }}>
      <Box>
        <Typography variant="overline" color="text.secondary" component="p" id="theme-label">
          Theme
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode ?? 'system'}
          onChange={(_, value: 'system' | 'light' | 'dark' | null) => value && setMode(value)}
          aria-labelledby="theme-label"
        >
          <ToggleButton value="system">System</ToggleButton>
          <ToggleButton value="light">Light</ToggleButton>
          <ToggleButton value="dark">Dark</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box>
        <Typography variant="overline" color="text.secondary" component="p">
          Track list
        </Typography>
        <Button variant="outlined" size="small" onClick={resetLayout}>
          Reset sort and column widths
        </Button>
      </Box>
    </Stack>
  );
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function ShortcutsTab() {
  const mod = isMac() ? '⌘' : 'Ctrl';
  return (
    <Table size="small" aria-label="Keyboard shortcuts">
      <TableBody>
        {SHORTCUTS.map(({ keys, action, where }) => (
          <TableRow key={action}>
            <TableCell sx={{ whiteSpace: 'nowrap', width: '1%' }}>
              {keys.map((combo, i) => (
                <Box component="span" key={combo.join('+')}>
                  {i > 0 && ' / '}
                  {combo.map((key, j) => (
                    <Box component="span" key={key}>
                      {j > 0 && ' + '}
                      <Box
                        component="kbd"
                        sx={{
                          px: 0.75,
                          py: 0.25,
                          borderRadius: 0.5,
                          border: 1,
                          borderColor: 'divider',
                          bgcolor: 'action.hover',
                          fontFamily: 'inherit',
                          fontSize: 12,
                        }}
                      >
                        {key === 'Mod' ? mod : key}
                      </Box>
                    </Box>
                  ))}
                </Box>
              ))}
            </TableCell>
            <TableCell>
              {action}
              {where && (
                <Typography component="span" variant="caption" color="text.secondary">
                  {' '}
                  · {where}
                </Typography>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
