#!/usr/bin/env node
/**
 * Fetches the live ISV API v2 OpenAPI document and writes it to
 * `openapi/isv-api-v2.json` in a canonical, byte-stable form.
 *
 * Why this exists
 * ---------------
 * The SDK's types are generated from the committed spec, and CI already
 * verifies that `src/types/generated/` matches it. What was missing is the
 * link *upstream* of that: nothing verified the committed spec still matched
 * the backend. It didn't — the spec went ~3 months stale and the SDK shipped
 * a GET for an endpoint that had become a POST.
 *
 * Usage
 * -----
 *   ISV_API_SPEC_URL=https://<host>/isv-api/swagger/v2/swagger.json \
 *     node scripts/fetch-openapi-spec.mjs [--check]
 *
 * Without `--check` the spec is written in place (refresh workflow).
 * With `--check` nothing is written; the process exits non-zero if the live
 * document differs from what is committed (drift gate).
 *
 * The URL is never hard-coded: this repository is public and the document is
 * served from a non-production host that is not part of the public surface.
 *
 * Canonicalisation
 * ----------------
 * Three transforms make byte comparison meaningful. Without them the gate
 * fires on every run and gets ignored, which is worse than having no gate.
 *
 *  1. `info.version` is replaced with a constant. Upstream fills it from the
 *     `TAG_ID` build variable (e.g. `release-3.3.0-11868`), so it changes on
 *     every backend deploy. The real value is reported on stdout.
 *  2. Timestamps *inside* `example` / `examples` are flattened to a constant.
 *     Several of the backend's Swagger example providers compute their values
 *     from `DateTime.UtcNow`, so those subtrees differ on *every single
 *     request* — 21 leaves at the time of writing (`createdOn`, `modifiedOn`,
 *     `lastSeenOn`, `lastTransactionDate`, `transactionDateTime`).
 *
 *     Note the examples are kept, not dropped: `openapi-typescript` renders
 *     them as `@example` JSDoc on the generated types, so they reach editor
 *     tooltips and are worth preserving. Only the instant is replaced, and
 *     only within an example — a `format: date-time` schema declaration is
 *     never touched. Any ISO-8601 string is matched, so a new example
 *     provider with a fresh timestamp field cannot silently reintroduce
 *     drift.
 *  3. Object keys are sorted recursively. JSON object order carries no meaning
 *     in OpenAPI, but Swashbuckle's emission order can shift with unrelated
 *     backend changes (controller discovery order). Sorting keeps the diff
 *     limited to real contract changes. Array order is preserved — it *is*
 *     meaningful (`required`, `enum`, parameter lists).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = resolve(HERE, '..', 'openapi', 'isv-api-v2.json');

/**
 * Stand-in for `info.version`. See the canonicalisation note above.
 * The real backend release is reported on stdout instead.
 */
const NORMALISED_VERSION = 'live';

const FETCH_TIMEOUT_MS = 60_000;

function fail(message) {
  console.error(`\nerror: ${message}\n`);
  process.exit(1);
}

/** Keys whose subtrees get their timestamps flattened. See note (2). */
const EXAMPLE_KEYS = new Set(['example', 'examples']);

/** ISO-8601 instant, with optional fractional seconds and offset. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Replacement for generated timestamps. Deliberately a round, obviously
 * synthetic instant so nobody reads meaning into it.
 */
const NORMALISED_INSTANT = '2026-01-01T00:00:00Z';

/**
 * Recursively sort object keys. Inside an example subtree (`insideExample`),
 * ISO-8601 strings collapse to {@link NORMALISED_INSTANT}. Arrays keep their
 * order; other scalars pass through.
 */
function canonicalise(value, insideExample = false) {
  if (typeof value === 'string') {
    return insideExample && ISO_INSTANT.test(value) ? NORMALISED_INSTANT : value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalise(item, insideExample));
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalise(value[key], insideExample || EXAMPLE_KEYS.has(key));
  }
  return out;
}

function serialise(spec) {
  return `${JSON.stringify(canonicalise(spec), null, 2)}\n`;
}

function countOperations(spec) {
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
  let n = 0;
  for (const item of Object.values(spec.paths ?? {})) {
    for (const method of Object.keys(item)) if (methods.has(method)) n += 1;
  }
  return n;
}

async function fetchSpec(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (cause) {
    fail(`could not reach ${url}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (!response.ok) {
    fail(
      `${url} responded ${response.status}. ` +
        'The document is served under the `isv-api` route prefix and is disabled on ' +
        'production hosts (`UseCustomSwagger` skips registration when the environment ' +
        'is Production), so a 404 usually means the URL points at a production ring.',
    );
  }
  try {
    return await response.json();
  } catch {
    fail(`${url} did not return JSON. Check the URL points at swagger.json, not the UI.`);
  }
}

const checkOnly = process.argv.includes('--check');
const url = process.env.ISV_API_SPEC_URL?.trim();

if (!url) {
  fail(
    'ISV_API_SPEC_URL is not set.\n' +
      '       Point it at the v2 swagger document, e.g.\n' +
      '         ISV_API_SPEC_URL=https://<uat-host>/isv-api/swagger/v2/swagger.json',
  );
}

const live = await fetchSpec(url);

if (live.openapi === undefined || live.paths === undefined) {
  fail(`${url} returned JSON that is not an OpenAPI document (no \`openapi\`/\`paths\`).`);
}

const backendRelease = live.info?.version ?? '(unknown)';
live.info = { ...live.info, version: NORMALISED_VERSION };

const next = serialise(live);

let current = null;
try {
  current = readFileSync(SPEC_PATH, 'utf8');
} catch {
  // First run, or the file was removed. Treated as "everything is new".
}

console.log(`source          ${url}`);
console.log(`backend release ${backendRelease}`);
console.log(`operations      ${countOperations(live)}`);
console.log(`schemas         ${Object.keys(live.components?.schemas ?? {}).length}`);

if (current === next) {
  console.log('\nCommitted spec matches the live document. No drift.');
  process.exit(0);
}

if (checkOnly) {
  const currentSpec = current === null ? null : JSON.parse(current);
  console.error('\nDrift detected: openapi/isv-api-v2.json no longer matches the backend.');
  if (currentSpec !== null) {
    const ops = (spec) => {
      const set = new Set();
      for (const [path, item] of Object.entries(spec.paths ?? {})) {
        for (const method of Object.keys(item)) {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
            set.add(`${method.toUpperCase()} ${path}`);
          }
        }
      }
      return set;
    };
    const committed = ops(currentSpec);
    const upstream = ops(live);
    const gone = [...committed].filter((op) => !upstream.has(op)).sort();
    const fresh = [...upstream].filter((op) => !committed.has(op)).sort();
    if (gone.length > 0) {
      console.error(`\n  Committed but no longer live (${gone.length}):`);
      for (const op of gone) console.error(`    - ${op}`);
    }
    if (fresh.length > 0) {
      console.error(`\n  Live but not committed (${fresh.length}):`);
      for (const op of fresh) console.error(`    + ${op}`);
    }
    if (gone.length === 0 && fresh.length === 0) {
      console.error('\n  The operation set is unchanged — the difference is in schemas,');
      console.error('  parameters, or response bodies. Refresh and inspect the diff.');
    }
  }
  console.error(
    '\nTo resolve:\n' +
      '  1. ISV_API_SPEC_URL=<url> npm run openapi:fetch\n' +
      '  2. npm run openapi:types\n' +
      '  3. Fix any resulting compile errors, then commit both.\n',
  );
  process.exit(1);
}

writeFileSync(SPEC_PATH, next);
console.log('\nWrote openapi/isv-api-v2.json.');
console.log('Next: npm run openapi:types (then fix any compile errors).');
