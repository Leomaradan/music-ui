import { errorResponse, jsonError, pickHeaders, subsonicIdSchema } from '@/lib/http/responses';
import { getSubsonicClient } from '@/lib/subsonic';

export const runtime = 'nodejs';

const FORWARDED = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'last-modified',
  'etag',
] as const;

/**
 * Audio stream proxy (PLAN.md §6). The original file (`format=raw`, no transcoding) is
 * streamed as it arrives; `Range` is forwarded so the browser can seek (206 responses).
 * The upstream request is aborted when the browser disconnects.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = subsonicIdSchema.safeParse((await params).id);
  if (!id.success) return jsonError(400, 'Invalid track id');

  const range = request.headers.get('range');
  try {
    const upstream = await getSubsonicClient().fetchBinary(
      'stream',
      { id: id.data, format: 'raw' },
      { signal: request.signal, headers: range ? { range } : {} },
    );
    const headers = pickHeaders(upstream.headers, FORWARDED);
    headers.set('cache-control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
