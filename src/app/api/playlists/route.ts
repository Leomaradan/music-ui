import { z } from 'zod';
import { errorResponse, jsonError, subsonicIdSchema } from '@/lib/http/responses';
import {
  MAX_PLAYLIST_TRACKS,
  getPlaylistOrder,
  setPlaylistOrder,
  sortPlaylists,
  toSummary,
} from '@/lib/playlists';
import { createPlaylist, getPlaylists, getSubsonicClient } from '@/lib/subsonic';

export const runtime = 'nodejs';

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  trackIds: z.array(subsonicIdSchema).max(MAX_PLAYLIST_TRACKS).default([]),
});

/** The account's playlists, in the order chosen in the sidebar (PLAN.md §7.2). */
export async function GET() {
  try {
    const playlists = sortPlaylists(await getPlaylists(getSubsonicClient()), getPlaylistOrder());
    return Response.json(
      { playlists: playlists.map(toSummary) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Creates a playlist (from dropped tracks), placed last in the sidebar. */
export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Expected { name, trackIds }');
  try {
    const playlist = await createPlaylist(getSubsonicClient(), {
      name: parsed.data.name,
      songIds: parsed.data.trackIds,
    });
    setPlaylistOrder([...getPlaylistOrder().filter((id) => id !== playlist.id), playlist.id]);
    return Response.json(toSummary(playlist), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
