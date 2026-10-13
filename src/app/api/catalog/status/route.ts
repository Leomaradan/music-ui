import { getCatalogService } from '@/lib/catalog';

export const runtime = 'nodejs';

/** Sync state and progress (PLAN.md §6). */
export function GET(): Response {
  return Response.json(getCatalogService().sync.status(), {
    headers: { 'cache-control': 'no-store' },
  });
}
