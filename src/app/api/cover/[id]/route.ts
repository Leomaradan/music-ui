import { errorResponse, jsonError, pickHeaders, subsonicIdSchema } from '@/lib/http/responses';
import { getSubsonicClient } from '@/lib/subsonic';

export const runtime = 'nodejs';

/** Sizes the UI uses; anything else is refused so the server cache stays small. */
export const COVER_SIZES = [64, 150, 300, 600] as const;

/**
 * Cover art proxy (PLAN.md §6). Navidrome cover ids (e.g. `mf-<song id>`) do not change
 * when the artwork does, so browsers cache covers for a day rather than for good.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = subsonicIdSchema.safeParse((await params).id);
  if (!id.success) return jsonError(400, 'Invalid cover id');
  const size = Number(new URL(request.url).searchParams.get('size') ?? 300);
  if (!(COVER_SIZES as readonly number[]).includes(size)) {
    return jsonError(400, `size must be one of ${COVER_SIZES.join(', ')}`);
  }

  try {
    const upstream = await getSubsonicClient().fetchBinary(
      'getCoverArt',
      { id: id.data, size },
      { signal: request.signal },
    );
    const headers = pickHeaders(upstream.headers, ['content-type', 'content-length']);
    headers.set('cache-control', 'private, max-age=86400');
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
