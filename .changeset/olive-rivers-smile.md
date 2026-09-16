---
'@getflute/sdk': patch
---

Make the quick-start example work on a real sandbox account.

0.3.2 added the required `paymentProcessorId` but selected it with
`availablePaymentProcessors?.[0]`, which is arbitrary. On a self-serve sandbox
account the ACH processor comes first, so the card sale in the example was
sent to an ACH processor and rejected with a bare 400. Processors are now
selected by `type`.

The example also sent no `billingAddress`. Sandbox accounts have address
verification enabled by default on a `Moderate` profile, so the sale returned
`Declined` with `declineDetails.code === 'AVS'` — a successful HTTP call with a
declined transaction, which no error handler catches.

Verified against a production sandbox account using the SDK's own default
hosts, with no `baseUrls` override: the corrected example returns `Captured`.
