# Contributing to `@getflute/sdk`

Thanks for your interest! This is the official server-side
TypeScript / Node.js SDK for the Flute payment platform. Patterns
that land here become the contract every other Flute SDK follows, so
we hold this repo to a high bar.

## Prerequisites

- Node.js `>=20.19.0` (the `.nvmrc` pins to `22` — latest LTS major)
- `npm` (lockfile is `package-lock.json`)

```bash
nvm use
npm install
npm run verify
```

## Local workflow

| Goal                      | Command                                       |
| ------------------------- | --------------------------------------------- |
| Build (ESM + CJS + types) | `npm run build`                               |
| Unit tests                | `npm test`                                    |
| Watch tests               | `npm run test:watch`                          |
| Coverage                  | `npm run test:coverage`                       |
| Lint                      | `npm run lint` (auto-fix: `npm run lint:fix`) |
| Format                    | `npm run format`                              |
| Typecheck only            | `npm run typecheck`                           |
| Everything before pushing | `npm run verify`                              |

## The OpenAPI contract

`src/types/generated/isv-api-v2.d.ts` is generated from
`openapi/isv-api-v2.json`, which is a committed snapshot of the ISV API
v2 swagger document. Two links have to hold, and CI checks both:

| Link           | Enforced by                  | When                 |
| -------------- | ---------------------------- | -------------------- |
| spec → types   | `verify` job in `ci.yml`     | every push and PR    |
| backend → spec | `spec-drift` job in `ci.yml` | daily, and on demand |

Only the first of these existed until recently, which is how the spec
went roughly three months stale without anyone noticing. During that
window `calculate-amount` changed from `GET` to `POST`,
`CaptureRequestDto.amount` became `captureAmount`, list responses moved
from `total` to `pageInfo`, and an upstream strict-JSON-binding change
turned every stale field name into a hard `400`. The SDK kept
compiling and its tests kept passing the whole time, because both were
measured against the stale snapshot.

### Refreshing the snapshot

```bash
ISV_API_SPEC_URL=https://<host>/isv-api/swagger/v2/swagger.json npm run openapi:fetch
npm run openapi:types
npm run typecheck   # compile errors here ARE the contract changes — read them
```

Commit `openapi/isv-api-v2.json` and `src/types/generated/` together, in
the same commit as whatever source changes the new contract forced. A
commit that updates one without the other will fail `verify`.

`npm run openapi:check` performs the same comparison without writing
anything, and exits non-zero on drift. That is what the scheduled job
runs.

### Notes on the URL and the snapshot

- **The URL is not hard-coded.** This repository is public and the
  document is served from a non-production host that is not part of the
  published surface, so CI reads it from the `ISV_API_SPEC_URL` secret.
  Forks without the secret skip the drift job instead of failing.
- **The document lives under the `isv-api` route prefix**
  (`/isv-api/swagger/v2/swagger.json`, not `/swagger/v2/swagger.json`),
  and upstream disables it on production hosts. A `404` almost always
  means the URL points at a production ring.
- **The snapshot is canonicalised, not raw.** `npm run openapi:fetch`
  sorts object keys, pins `info.version` (upstream fills it from a
  per-deploy build tag), and flattens timestamps inside `example`
  values, several of which upstream computes from `DateTime.UtcNow` and
  which therefore change on every single request. Without this the
  drift check would fire on every run and get ignored, which is worse
  than not having it. See the header comment in
  `scripts/fetch-openapi-spec.mjs` for the reasoning in full.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/).
The `commit-msg` hook validates it. Examples:

- `feat(transactions): implement sale and refund`
- `fix(auth): retry on 401 only once per request`
- `docs(readme): add quickstart for payment sessions`

## Releasing

We use [changesets](https://github.com/changesets/changesets). For any
user-facing change:

```bash
npx changeset
```

Pick `patch`, `minor`, or `major`, write a one-line description, and
commit the generated file together with your code change. Releases are
published to npm by the `release` workflow when a version PR is merged
to `main`.

## Public API contract

Anything re-exported from `src/index.ts` is the public surface and is
covered by SemVer. Internal modules (`src/internal/`) may break
between minor versions. Don't import from internal paths in tests you
intend to ship as examples.

## Security

If you find a vulnerability, please follow the process documented in
[`SECURITY.md`](./SECURITY.md). Do NOT open a public issue.
