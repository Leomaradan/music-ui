import { sampleSnapshot } from '../helpers/catalog';

/**
 * Stories run in a real browser, where the sample catalog cannot be built (node:sqlite), so they
 * read this committed copy. It must stay identical to what the sync produces: run
 * `pnpm test:unit -u` to regenerate it after changing the fixtures or the snapshot format.
 */
it('catalog-snapshot.json matches the synced sample catalog', async () => {
  await expect(`${JSON.stringify(await sampleSnapshot(), null, 2)}\n`).toMatchFileSnapshot(
    './catalog-snapshot.json',
  );
});
