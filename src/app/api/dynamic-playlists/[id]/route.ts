import {
  deleteDynamicPlaylist,
  dynamicPlaylistIdSchema,
  dynamicPlaylistInputSchema,
  updateDynamicPlaylist,
} from '@/lib/dynamicPlaylists';
import { jsonError } from '@/lib/http/responses';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

/** Replaces the definition (name, match, criteria) of a dynamic playlist. */
export async function PUT(request: Request, { params }: Context) {
  const id = dynamicPlaylistIdSchema.safeParse((await params).id);
  if (!id.success) return jsonError(400, 'Invalid id');
  const parsed = dynamicPlaylistInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid playlist');
  const updated = updateDynamicPlaylist(id.data, parsed.data);
  if (!updated) return jsonError(404, 'No such dynamic playlist');
  return Response.json(updated, { headers: { 'cache-control': 'no-store' } });
}

export async function DELETE(_request: Request, { params }: Context) {
  const id = dynamicPlaylistIdSchema.safeParse((await params).id);
  if (!id.success) return jsonError(400, 'Invalid id');
  if (!deleteDynamicPlaylist(id.data)) return jsonError(404, 'No such dynamic playlist');
  return new Response(null, { status: 204 });
}
