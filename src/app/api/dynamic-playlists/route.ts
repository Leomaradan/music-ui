import {
  createDynamicPlaylist,
  dynamicPlaylistInputSchema,
  listDynamicPlaylists,
} from '@/lib/dynamicPlaylists';
import { jsonError } from '@/lib/http/responses';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' };

export function GET() {
  return Response.json({ playlists: listDynamicPlaylists() }, { headers: NO_STORE });
}

/** Creates a dynamic playlist from `{ name, match, criteria }`. */
export async function POST(request: Request) {
  const parsed = dynamicPlaylistInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid playlist');
  return Response.json(createDynamicPlaylist(parsed.data), { status: 201, headers: NO_STORE });
}
