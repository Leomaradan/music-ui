import { getCatalogService } from '@/lib/catalog';

export const runtime = 'nodejs';

/**
 * Catalog snapshot (PLAN.md §5). Revalidated by ETag: the client sends If-None-Match and
 * gets 304 while the catalog is unchanged. Served gzipped when the client accepts it
 * (Next.js does not compress route handler responses).
 */
export function GET(request: Request): Response {
  const snapshot = getCatalogService().snapshot();
  if (!snapshot) {
    return Response.json(
      { error: 'The catalog is not ready yet: the first sync has not completed.' },
      { status: 503, headers: { 'retry-after': '5', 'cache-control': 'no-store' } },
    );
  }

  const etag = `"${snapshot.version}"`;
  const headers = { etag, 'cache-control': 'no-cache', vary: 'accept-encoding' };
  if (matchesEtag(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers });
  }
  const contentType = { 'content-type': 'application/json; charset=utf-8' };
  if (acceptsGzip(request.headers.get('accept-encoding'))) {
    return new Response(new Uint8Array(snapshot.gzip), {
      headers: { ...headers, ...contentType, 'content-encoding': 'gzip' },
    });
  }
  return new Response(snapshot.json, { headers: { ...headers, ...contentType } });
}

function acceptsGzip(header: string | null): boolean {
  return (header ?? '').split(',').some((part) => {
    const [coding, ...params] = part.trim().toLowerCase().split(';');
    const disabled = params.some((param) => param.trim().replace(/\s/g, '') === 'q=0');
    return (coding === 'gzip' || coding === '*') && !disabled;
  });
}

function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === etag || value === '*');
}
