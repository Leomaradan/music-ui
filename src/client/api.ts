/** fetch() for the app's own JSON API: throws an Error with the server's message on failure. */
export async function api<T = unknown>(
  url: string,
  init: Omit<RequestInit, 'body'> & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(url, {
    cache: 'no-store',
    ...rest,
    headers: { ...(json === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `The server answered HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
