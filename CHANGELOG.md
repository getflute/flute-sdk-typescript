# Changelog

## 0.2.3

### Patch Changes

- a55d85a: Fix incorrect default API hosts for both environments.

  The `sandbox` and `production` environment defaults pointed at legacy
  `*.arise.risewithaurora.com` hosts instead of the documented `flute.com`
  endpoints. In particular, `sandbox` pointed at a **decommissioned UAT** host,
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
  the previous `*.arise.risewithaurora.com` production defaults, review before
  upgrading. You can always pin any host explicitly via `FluteConfig.baseUrls`.

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
