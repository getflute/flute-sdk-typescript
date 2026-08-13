# Changelog

## 0.3.1

### Patch Changes

- cae54d2: Correct the documented amount unit. **If you sized any amount from the previous
  examples, re-check it — they were 100x too large.**

  `AGENTS.md` stated that `baseAmount` is "in the merchant's smallest currency
  unit (`1000` = $10.00 USD)". It is not. The v2 API types the field as a decimal
  and echoes it back verbatim: send `10.5` and `processedAmount` comes back
  `10.5`. There is no minor-unit scaling anywhere in the request or response path.

  Every amount example was therefore 100x the figure its surrounding prose
  claimed — `sale({ baseAmount: 1000 })` was documented as "charge $10 USD" and
  actually charges **$1,000.00**. Nothing rejects it: the transaction is accepted,
  processed, and settles.

  This is the opposite of the Stripe and Square convention, so it is the easiest
  thing to get wrong here. The docs now say so explicitly, including what the unit
  is _not_, rather than leaving a reader's default assumption to do the damage.

  Corrected in the `AGENTS.md` quick-reference table, the `sale` / `capture` /
  `refund` / `calculateAmount` request shapes, and the `README.md` quickstart, with
  an inline note at each amount in the examples. `examples/03-payment-sessions.ts`
  already documented this correctly and is unchanged — the package previously
  shipped two files contradicting each other on the same money concept.

  Also fixes a stale field name in the same file: `AGENTS.md` documented
  `customerInitiatedTransaction`, but the field is `isCustomerInitiatedTransaction`.
  The v2 API rejects unmapped JSON properties, so the old spelling is a hard `400`
  rather than a silently ignored field. This one mattered disproportionately
  because `AGENTS.md` is the file AI coding agents read to generate integration
  code, so every agent following it emitted a request the API refuses.

  Documentation only — no runtime changes.

## 0.3.0

### Minor Changes

- 54afe85: Resync the SDK with the live ISV API v2 contract. **This release contains
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

## 0.2.3

### Patch Changes

- a55d85a: Fix incorrect default API hosts for both environments.

  The `sandbox` and `production` environment defaults pointed at legacy
  pre-rebrand hosts instead of the documented `flute.com` endpoints. In
  particular, `sandbox` pointed at a **decommissioned** host,
  so `new Flute({ environment: 'sandbox' })` failed with
  `FluteAuthenticationError: HTTP 401` on the first request, during the OAuth
  token exchange (`POST ${oauth}/oauth2/token`).

  Both environments now default to the official `flute.com` hosts:
  - **Sandbox**: `https://sandbox.api.flute.com`,
    `https://sandbox.api.flute.com/pay-int-api`,
    OAuth base `https://sandbox.oauth.api.flute.com`
    (resolved token endpoint `https://sandbox.oauth.api.flute.com/oauth2/token`)
  - **Production**: `https://api.flute.com`,
    `https://api.flute.com/pay-int-api`,
    OAuth base `https://oauth.api.flute.com`
    (resolved token endpoint `https://oauth.api.flute.com/oauth2/token`)

  ⚠️ **This also changes the default _production_ endpoints.** If you depended on
  the previous pre-rebrand production defaults, review before upgrading. You can
  always pin any host explicitly via `FluteConfig.baseUrls`.

## 0.2.2

### Patch Changes

- 152fb2f: Bump the `--save-exact` pin example in `AGENTS.md` from `0.2.0` to `0.2.1` so the snippet pins to the version published with the file actually included in the tarball. No runtime changes.

## 0.2.1

### Patch Changes

- b492a82: Ship `AGENTS.md` in the published npm tarball and expand it with three new sections: `Method-by-method request shapes` documents the literal request body for every mutating method (including the `transactionDetails.cardData` nesting on `sale` / `authorize` and the partial-amount rules on `capture` / `refund`), `Sandbox test cards` lists the deterministic PANs for the SandboxCard and TSYS sandbox processors with their expected response codes, and `UI integration patterns` captures the settings-prefetch flow for `paymentProcessorId`, last-id chaining, two-stage confirms for production-environment mutating calls, the test-card preset selector, and sensitive-field masking. No runtime changes.

All notable changes to `@getflute/sdk` are documented here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/).

## 0.2.0

### Initial public release

First public release of the official server-side TypeScript / Node.js
SDK for the Flute payment platform under the `@getflute/sdk` scope.

**Capabilities**

- **Auth (`flute.sessions.*`)** — OAuth 2.0 `client_credentials` with
  proactive + reactive refresh, race-safe token coalescing, and a
  pluggable `TokenStorage` (default in-memory; swap for Redis / KV in
  serverless deployments).
- **Transactions (`flute.transactions.*`)** — `list`, `retrieve`,
  `sale`, `authorize`, `capture`, `void`, `refund`, `calculateAmount`.
  Idempotency keys are auto-generated for every state-changing request
  and may be overridden per call.
- **Payment Sessions (`flute.paymentSessions.*`)** — `create`,
  `retrieve`, `cancel` against the Payment Integrations v1 API.
  Accepts both string and numeric `mode`.
- **Settings (`flute.settings.getPaymentSettings`)** — returns the
  merchant's payment configuration (processors, methods, fees).
- **Webhooks (`flute.webhooks.verifySignature`)** — HMAC-SHA256 with
  timing-safe comparison and a configurable replay window.
- **Transport** — `fetch` wrapper with timeouts, exponential backoff
  with full jitter for retries (5xx + network errors), `Retry-After`
  honoring on 429, structured `FluteError` hierarchy, and
  sensitive-field redaction in logger output.
- **Types** — generated from the live `isv-api-v2.json` OpenAPI spec
  via `openapi-typescript`.
- **Tooling** — ESM + CJS dual build, `.d.ts` types, npm provenance
  attestations on every release.
