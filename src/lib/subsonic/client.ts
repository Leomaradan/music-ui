import type { z } from 'zod';
import { createTokenAuth } from './auth';
import { SubsonicError } from './errors';
import { envelopeSchema, type SubsonicEnvelope } from './schemas';

/** Subsonic API version sent with every request (Navidrome implements 1.16.1). */
export const SUBSONIC_API_VERSION = '1.16.1';

export type ParamValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number)[];
export type Params = Record<string, ParamValue>;

export interface SubsonicClientOptions {
  /** Server base URL, e.g. `http://navidrome:4533` (a path prefix is allowed). */
  baseUrl: string;
  username: string;
  password: string;
  /** Value of the `c` parameter. */
  clientName?: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Injected for tests. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export class SubsonicClient {
  private readonly restBase: URL;
  private readonly clientName: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: SubsonicClientOptions) {
    const base = new URL(options.baseUrl);
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    this.restBase = new URL('rest/', base);
    this.clientName = options.clientName ?? 'music-ui';
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /**
   * Full, authenticated URL for a Subsonic method. Server-side only: the URL carries
   * a reusable token, so it must never be sent to the browser or logged.
   * Array values are sent as repeated parameters (e.g. several `musicFolderId`).
   */
  buildUrl(method: string, params: Params = {}): URL {
    const url = new URL(method, this.restBase);
    const { t, s } = createTokenAuth(this.options.password);
    const search = url.searchParams;
    search.set('u', this.options.username);
    search.set('t', t);
    search.set('s', s);
    search.set('v', SUBSONIC_API_VERSION);
    search.set('c', this.clientName);
    search.set('f', 'json');
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) search.append(key, String(item));
      } else {
        search.set(key, String(value));
      }
    }
    return url;
  }

  /**
   * Calls a JSON method and returns the unwrapped `subsonic-response`.
   * Throws `SubsonicError` on failure. Network failures are retried once.
   */
  async request(
    method: string,
    params: Params = {},
    options: RequestOptions = {},
  ): Promise<SubsonicEnvelope> {
    try {
      return await this.requestOnce(method, params, options);
    } catch (error) {
      if (error instanceof SubsonicError && error.kind === 'network' && !options.signal?.aborted) {
        return this.requestOnce(method, params, options);
      }
      throw error;
    }
  }

  /** Calls a method and validates the payload stored under `key` (e.g. `musicFolders`). */
  async get<S extends z.ZodType>(
    method: string,
    key: string,
    schema: S,
    params: Params = {},
    options: RequestOptions = {},
  ): Promise<z.output<S>> {
    const envelope = await this.request(method, params, options);
    const result = schema.safeParse(envelope[key]);
    if (!result.success) {
      throw new SubsonicError('invalid-response', `${method}: unexpected "${key}" payload`, {
        cause: result.error,
      });
    }
    return result.data;
  }

  private async requestOnce(
    method: string,
    params: Params,
    { signal }: RequestOptions,
  ): Promise<SubsonicEnvelope> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await this.fetchImpl(this.buildUrl(method, params), {
        signal: combined,
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new SubsonicError(
        'network',
        `${method}: Subsonic server unreachable (${describeFetchError(error, this.timeoutMs)})`,
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new SubsonicError(
        'http',
        `${method}: Subsonic server returned HTTP ${response.status}`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new SubsonicError('invalid-response', `${method}: response is not JSON`, {
        cause: error,
      });
    }

    const parsed = envelopeSchema.safeParse(
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)['subsonic-response']
        : undefined,
    );
    if (!parsed.success) {
      throw new SubsonicError('invalid-response', `${method}: not a Subsonic response`, {
        cause: parsed.error,
      });
    }

    const envelope = parsed.data;
    if (envelope.status === 'failed') {
      const code = envelope.error?.code ?? 0;
      const message = envelope.error?.message ?? 'unknown error';
      throw new SubsonicError('api', `${method}: ${message} (code ${code})`, { code });
    }
    return envelope;
  }
}

function describeFetchError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') return `timed out after ${timeoutMs} ms`;
    const cause = error.cause as { code?: unknown } | undefined;
    if (cause && typeof cause.code === 'string') return cause.code;
  }
  return 'fetch failed';
}
