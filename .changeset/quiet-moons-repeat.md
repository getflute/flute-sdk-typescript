---
'@getflute/sdk': patch
---

Fix the quick-start example, which could not work as published.

`transactions.sale()` and `authorize()` require a `paymentProcessorId`, and
the README's quick start omitted it — copy-pasting it returned
`400 PaymentProcessorId is required.` on the reader's first call. The value
identifies which of the merchant's configured processors settles the
transaction, so it cannot be a literal in an example; it has to be read from
`settings.getPaymentSettings()` first.

The quick start, the first recipe and `examples/01-quickstart.ts` now fetch
it and pass it. The first recipe already called `getPaymentSettings()` and
then discarded the result, which is how the omission stayed invisible.

Documentation only — no runtime behaviour changes. `README.md` ships inside
the published package, so this needs a release to reach anyone.
