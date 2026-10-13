'use client';

import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { useNotificationStore } from '@/client/stores/notificationStore';

/** Shows the latest notification (playlist created, tracks added, errors…). */
export default function Notifier() {
  const current = useNotificationStore((state) => state.current);
  const dismiss = useNotificationStore((state) => state.dismiss);
  return (
    <Snackbar
      key={current?.key}
      open={current !== null}
      autoHideDuration={current?.severity === 'error' ? 8000 : 3000}
      onClose={(_, reason) => reason !== 'clickaway' && dismiss()}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Alert
        onClose={dismiss}
        severity={current?.severity ?? 'info'}
        variant="filled"
        sx={{ width: '100%' }}
      >
        {current?.message}
      </Alert>
    </Snackbar>
  );
}
