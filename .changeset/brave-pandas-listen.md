---
'@getflute/sdk': patch
---

Resync the OpenAPI spec with backend release-3.6.0-16159.

Real contract movement this time, not formatting. The operation set is
unchanged; the schemas are not:

- `AmountDetailsDto` gains `taxAmount` and `taxRate`, so the breakdown
  returned by `transactions.calculateAmount()` and carried on transaction
  responses now types those fields.
- `WebhookEventType` gains eight `application.*` values covering the
  onboarding application lifecycle: invited, draft, in_progress,
  information_needed, awaiting_signature, submitted, under_review, declined.
- `taxId` is masked in responses (`12-3456789` → `*****6789`) and its
  documented examples updated to match.

Additive to the published types — nothing is removed or narrowed — but the
new fields and event values only reach consumers through a release, which is
why this carries a changeset where the previous spec resync did not.
