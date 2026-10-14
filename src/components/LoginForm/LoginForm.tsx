'use client';

import { useState, type FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export interface LoginFormProps {
  /** Where to go once signed in. */
  next: string;
  /** No account exists yet: explain how to create one. */
  noUsers: boolean;
  /** Navigation after a successful login (a full page load by default). */
  onSignedIn?: (next: string) => void;
}

/** The login screen shown in front of the app when AUTH_ENABLED is on. */
export default function LoginForm({ next, noUsers, onSignedIn }: Readonly<LoginFormProps>) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        (onSignedIn ?? ((path) => window.location.assign(path)))(next);
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `The server answered HTTP ${response.status}`);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper
        component="form"
        onSubmit={submit}
        variant="outlined"
        sx={{ width: '100%', maxWidth: 360, p: 3 }}
      >
        <Stack spacing={2}>
          <Typography variant="h5" component="h1">
            Music UI
          </Typography>
          {noUsers && (
            <Alert severity="info">
              No account yet. Create one on the server:
              <Box component="code" sx={{ display: 'block', mt: 1, wordBreak: 'break-all' }}>
                docker exec -it music-ui node cli.mjs user add &lt;name&gt;
              </Box>
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" variant="contained" disabled={busy}>
            Sign in
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
