import { decodeSnapshot, type Catalog } from '@/client/catalog/decode';
import { CatalogRepository } from '@/lib/catalog/repository';
import { buildSnapshot, type CatalogSnapshot } from '@/lib/catalog/snapshot';
import { CatalogSync } from '@/lib/catalog/sync';
import { openDatabase } from '@/lib/db';
import { FakeNavidrome } from './fake-navidrome';

/** Snapshot of the two-library sample catalog (10 tracks), as served by /api/catalog. */
export async function sampleSnapshot(version = 'v1'): Promise<CatalogSnapshot> {
  const repository = new CatalogRepository(openDatabase(':memory:'));
  await new CatalogSync({ client: new FakeNavidrome().client(), repository }).sync();
  return buildSnapshot(repository.read(), version, '2026-10-12T00:00:00Z');
}

export async function sampleCatalog(): Promise<Catalog> {
  return decodeSnapshot(await sampleSnapshot());
}

/** jsdom has no layout: give elements a size so virtualized lists render their rows. */
export function stubLayout(width = 1200, height = 800): () => void {
  const proto = HTMLElement.prototype;
  const originals = {
    offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'),
    offsetHeight: Object.getOwnPropertyDescriptor(proto, 'offsetHeight'),
  };
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => height });
  return () => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(proto, key, descriptor);
    }
  };
}
