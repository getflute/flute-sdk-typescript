---
'@getflute/sdk': patch
---

Correct the documented amount unit. **If you sized any amount from the previous
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
is *not*, rather than leaving a reader's default assumption to do the damage.

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
