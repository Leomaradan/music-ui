import { z } from 'zod';
import { errorResponse, jsonError, subsonicIdSchema } from '@/lib/http/responses';
import {
  MAX_PLAYLIST_TRACKS,
  getPlaylistOrder,
  setPlaylistOrder,
  toSummary,
  type PlaylistDetail,
} from '@/lib/playlists';
import { deletePlaylist, getPlaylist, getSubsonicClient, updatePlaylist } from '@/lib/subsonic';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    /** Appended at the end. */
    add: z.array(subsonicIdSchema).max(MAX_PLAYLIST_TRACKS).optional(),
    /** Positions to remove (0-based, in the current playlist). */
    remove: z.array(z.number().int().min(0)).max(MAX_PLAYLIST_TRACKS).optional(),
  })
  .refine((body) => body.name !== undefined || body.add?.length || body.remove?.length, {
    message: 'Nothing to change',
  });

async function playlistId(context: Context) {
  return subsonicIdSchema.safeParse((await context.params).id);
}

async function detail(id: string): Promise<PlaylistDetail> {
  const playlist = await getPlaylist(getSubsonicClient(), id);
  return { ...toSummary(playlist), trackIds: playlist.entry.map((song) => song.id) };
}

export async function GET(_request: Request, context: Context) {
  const id = await playlistId(context);
  if (!id.success) return jsonError(400, 'Invalid playlist id');
  try {
    return Response.json(await detail(id.data), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Rename, append tracks, remove tracks by position. Returns the updated playlist. */
export async function PATCH(request: Request, context: Context) {
  const id = await playlistId(context);
  if (!id.success) return jsonError(400, 'Invalid playlist id');
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Expected { name?, add?, remove? }');
  const { name, add, remove } = parsed.data;
  try {
    await updatePlaylist(getSubsonicClient(), {
      playlistId: id.data,
      name,
      songIdToAdd: add,
      songIndexToRemove: remove,
    });
    return Response.json(await detail(id.data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const id = await playlistId(context);
  if (!id.success) return jsonError(400, 'Invalid playlist id');
  try {
    await deletePlaylist(getSubsonicClient(), id.data);
    setPlaylistOrder(getPlaylistOrder().filter((other) => other !== id.data));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
