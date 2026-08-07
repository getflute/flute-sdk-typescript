---
'@getflute/sdk': minor
---

Resync the SDK with the live ISV API v2 contract. **This release contains
breaking changes to the `transactions` surface.** They are corrections: each
one replaces a shape that did not work against the API.

The committed OpenAPI snapshot had gone roughly three months stale, and CI
could not see it — it verified that the generated types matched the spec, but
nothing verified that the spec still matched the backend. Meanwhile an upstream
change enabled strict JSON binding on v2, which turned every stale request
field from "silently ignored" into a hard `400`.

**`transactions.calculateAmount` now works.** It was issuing
`GET /v2/transactions/calculate-amount`; the endpoint is a `POST` that takes a
JSON body. The `GET` was being matched by the `/{transactionId}` route, so every
call failed with `The value 'calculate-amount' is not valid`. `CalculateAmountParams`
is now derived from the request body schema instead of a query-parameter type.

No `Idempotency-Key` is sent on this call. It is a POST, but it is a pure
computation with nothing to replay, and stamping a key would let a future
deduplicating gateway serve a cached breakdown for a live calculation. Pass
`idempotencyKey` explicitly if you want one.

**`transactions.list` now paginates and reports totals.** Two separate bugs:

- The response was typed `{ items, total }`. The wire returns
  `{ items, pageInfo }`, where `pageInfo` carries `pageIndex`, `pageSize`,
  `totalItems`, `totalPages`, and `hasMore`. `page.total` was therefore always
  `undefined` at runtime while typechecking clean.
- The query parameter was sent as `page`. The API reads `pageIndex`, which is
  **zero-based**. An unknown query parameter is ignored rather than rejected, so
  every call silently returned the first page regardless of what was requested.

`ListTransactionsParams` is now derived from the spec, which also exposes the
filters the endpoint always supported and the SDK never surfaced: `fromDate` /
`toDate`, `transactionStatus`, `paymentMethodType`, `customerId`, `minAmount` /
`maxAmount`, `referenceId`, `batchId`, `sourceType` / `sourceId`, and
`sortBy` / `sortOrder`.

**Partial capture and partial refund now work.** `CaptureRequestDto.amount` is
`captureAmount` upstream, and `ReversalRequestDto.amount` is `reversalAmount`.
Under strict JSON binding the old names are rejected with a `400`, so any
partial capture or partial refund was failing.

**Response types are more precise.** `transactions.list` returns
`TransactionSummary` rows, not full `Transaction` records — the list projection
genuinely omits `transactionEvents`, `refundDetails`, `declineDetails`,
`addressVerificationServiceResponse`, and `originalTransactionId`. Call
`retrieve` when you need those. `TransactionResult` (returned by the mutating
methods) is now an alias of `Transaction`, following the upstream consolidation
of `TransactionResponseDto` into `GetTransactionResponseDto`.

New type exports: `TransactionSummary`, `TransactionResult`, `PageInfo`.

### Migration

```diff
- const page = await flute.transactions.list({ page: 1, pageSize: 25 });
- console.log(page.total, page.items.length);
+ // pageIndex is zero-based
+ const page = await flute.transactions.list({ pageIndex: 0, pageSize: 25 });
+ console.log(page.pageInfo?.totalItems, page.items?.length);

- await flute.transactions.capture(id, { amount: 750 });
+ await flute.transactions.capture(id, { captureAmount: 750 });

- await flute.transactions.refund(id, { amount: 500 });
+ await flute.transactions.refund(id, { reversalAmount: 500 });
```

`calculateAmount` keeps its call signature — only the transport changed, so no
caller edit is required.

`items` and `pageInfo` are optional on the generated envelope because the spec
marks them nullable; `?? []` and `?.` are the expected access pattern.

### Tooling

`npm run openapi:fetch` refreshes the snapshot from the live swagger document
and `npm run openapi:check` fails on drift. A scheduled `spec-drift` CI job runs
the latter daily and files an issue when the spec falls behind, closing the
`backend → spec` gap that allowed all of the above. See `CONTRIBUTING.md`.
