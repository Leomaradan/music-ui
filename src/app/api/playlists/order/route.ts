import { z } from 'zod';
import { jsonError, subsonicIdSchema } from '@/lib/http/responses';
import { setPlaylistOrder } from '@/lib/playlists';

export const runtime = 'nodejs';

const schema = z.object({ ids: z.array(subsonicIdSchema).max(10_000) });

/** Saves the sidebar order of the playlists (Navidrome has no notion of it). */
export async function PUT(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Expected { ids }');
  setPlaylistOrder([...new Set(parsed.data.ids)]);
  return new Response(null, { status: 204 });
}
