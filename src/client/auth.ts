/** The session ended (expired, signed out elsewhere, user removed): go to the login screen. */
export function redirectToLogin(): void {
  const { pathname, search } = window.location;
  const next = pathname === '/' && !search ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  window.location.assign(`/login${next}`);
}

/** Signs out and shows the login screen. */
export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => undefined);
  window.location.assign('/login');
}
