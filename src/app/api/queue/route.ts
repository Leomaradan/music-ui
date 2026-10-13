import { z } from 'zod';
import { errorResponse, jsonError, subsonicIdSchema } from '@/lib/http/responses';
import { getPlayQueue, getSubsonicClient, savePlayQueue } from '@/lib/subsonic';

export const runtime = 'nodejs';

/** Upper bound for a saved queue (the browser sends at most this many tracks). */
export const MAX_QUEUE_LENGTH = 5_000;

export interface QueuePayload {
  ids: string[];
  /** Index of the current track in `ids`, -1 when none. */
  index: number;
  /** Seconds into the current track. */
  position: number;
}

const putSchema = z.object({
  ids: z.array(subsonicIdSchema).max(MAX_QUEUE_LENGTH),
  index: z.number().int().min(-1),
  position: z.number().min(0),
});

/** The account's saved play queue ("Currently playing"), shared with other clients. */
export async function GET() {
  try {
    const queue = await getPlayQueue(getSubsonicClient());
    const ids = queue.entry.map((song) => song.id);
    const payload: QueuePayload = {
      ids,
      index: queue.current ? ids.indexOf(queue.current) : -1,
      position: (queue.position ?? 0) / 1000,
    };
    return Response.json(payload, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Expected a JSON body');
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success || parsed.data.index >= parsed.data.ids.length) {
    return jsonError(400, 'Invalid queue');
  }
  const { ids, index, position } = parsed.data;
  try {
    await savePlayQueue(getSubsonicClient(), {
      ids,
      current: ids[index],
      position: index >= 0 ? position * 1000 : undefined,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
