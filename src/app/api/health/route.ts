import { getCatalogService } from '@/lib/catalog';
import { getSubsonicClient, ping } from '@/lib/subsonic';

export const runtime = 'nodejs';

const PING_TIMEOUT_MS = 3_000;

/**
 * Health check (PLAN.md §6), used by the Docker HEALTHCHECK. Always 200 while the app
 * itself runs: an unreachable Navidrome is reported as "degraded" rather than failing the
 * container, since restarting the app would not fix it.
 */
export async function GET() {
  let subsonic: { reachable: boolean; server?: string; error?: string };
  try {
    const info = await ping(getSubsonicClient(), { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    subsonic = {
      reachable: true,
      server: [info.type, info.serverVersion].filter(Boolean).join(' ') || `API ${info.apiVersion}`,
    };
  } catch (error) {
    subsonic = { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }

  const status = getCatalogService().sync.status();
  return Response.json(
    {
      status: subsonic.reachable && status.state !== 'error' ? 'ok' : 'degraded',
      subsonic,
      catalog: {
        state: status.state,
        trackCount: status.trackCount,
        lastSync: status.lastSync?.at ?? null,
        lastError: status.lastError?.message ?? null,
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
