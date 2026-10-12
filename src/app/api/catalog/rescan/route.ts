import { getCatalogService } from '@/lib/catalog';

export const runtime = 'nodejs';

/**
 * Starts a full sync even if the server reports no change (Settings → Rescan).
 * Returns at once with 202; progress is available at /api/catalog/status.
 */
export function POST(): Response {
  const { sync } = getCatalogService();
  sync.sync({ force: true }).catch(() => {
    // Logged and exposed by /api/catalog/status.
  });
  return Response.json(sync.status(), { status: 202, headers: { 'cache-control': 'no-store' } });
}
