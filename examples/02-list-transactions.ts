/**
 * Example: paginating transactions and printing a small summary.
 *
 * Run with:
 *
 *     FLUTE_CLIENT_ID=... FLUTE_CLIENT_SECRET=... \
 *     npx tsx examples/02-list-transactions.ts
 *
 * Optional env knobs:
 *
 *     FLUTE_ENVIRONMENT=sandbox|production       # default: sandbox
 *     FLUTE_TX_PAGE_SIZE=50                       # default: 25
 *     FLUTE_TX_MAX_PAGES=4                        # safety cap; default: 4
 */

import { Environment, Flute } from '../src/index.js';

async function main(): Promise<void> {
  const clientId = process.env['FLUTE_CLIENT_ID'];
  const clientSecret = process.env['FLUTE_CLIENT_SECRET'];
  if (clientId === undefined || clientSecret === undefined) {
    console.error('Missing FLUTE_CLIENT_ID / FLUTE_CLIENT_SECRET.');
    process.exit(1);
  }

  const flute = new Flute({
    clientId,
    clientSecret,
    environment:
      process.env['FLUTE_ENVIRONMENT'] === 'production'
        ? Environment.Production
        : Environment.Sandbox,
    userAgentSuffix: 'flute-sdk-list-example/1.0',
  });

  const pageSize = Number(process.env['FLUTE_TX_PAGE_SIZE'] ?? '25');
  const maxPages = Number(process.env['FLUTE_TX_MAX_PAGES'] ?? '4');

  let pagesVisited = 0;
  let printed = 0;

  // `pageIndex` is zero-based, and the server echoes it back in `pageInfo`
  // alongside `totalItems` / `hasMore`.
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const response = await flute.transactions.list({ pageIndex, pageSize });
    const items = response.items ?? [];
    const pageInfo = response.pageInfo;
    pagesVisited += 1;
    printed += items.length;

    const totalItems = pageInfo?.totalItems;
    console.log(
      `page ${String(pageIndex)}: ${String(items.length)} txns ` +
        `(printed ${String(printed)}${totalItems === undefined ? '' : ` of ${String(totalItems)}`})`,
    );
    for (const tx of items) {
      console.log(
        '  ',
        tx.transactionId ?? '(no id)',
        tx.transactionStatus ?? '—',
        '·',
        tx.transactionDateTime ?? '—',
      );
    }

    // Prefer the server's own signal; fall back to a short page when the
    // envelope is absent.
    if (pageInfo?.hasMore === false) break;
    if (pageInfo === undefined && items.length < pageSize) break;
  }

  console.log(
    `\nDone. Visited ${String(pagesVisited)} pages, ${String(printed)} transactions printed.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
