---
name: frontend-quality-gate
description: Run and summarize frontend quality checks before merge. Use when validating lint, tests, type safety, e2e impact, and targeted diagnostics.
---

# Frontend Quality Gate

Run the checks the CI runs and return a merge-readiness summary.

## What `check:ci` covers

`pnpm run check:ci` (in `app/`) is the local twin of the `lint_typecheck`,
`unit` and bundle portions of `.github/workflows/app-ci.yml`; the CI also runs
coverage, package codegen tests and Rust/Wasm/browser checks separately. It covers:

- lint (`pnpm run lint`)
- typecheck of the app and of the E2E code (`pnpm run typecheck`,
  `pnpm run typecheck:e2e`)
- the guards: `check:architecture`, `check:e2e-contracts`, `check:i18n-parity`,
  `check:i18n-keys`, `check:api-error-i18n`, `check:file-sizes`
- the token contrast check, which the CI runs from the repository root
  (`node scripts/check-token-contrast.mjs`)
- unit tests (`pnpm run test`)
- the production bundle (`vp build`), so a build failure surfaces here without a
  separate build step

Read the `check:ci` entry of `app/package.json` for the exact chain; if it
disagrees with this list, the script wins.

It does not cover what the CI runs in other jobs: Storybook tests and the
Playwright end-to-end suites. Nor does it test or compile the CEL engine
(`pnpm run test:cel-engine`, `pnpm run build:wasm` and
`pnpm run test:cel-engine:smoke`, which need Rust and `wasm-pack`). CI runs them
in the independent `cel_wasm` job; `build` produces only the frontend bundle.
The app loads the module at run time, so the bundle builds without it.

Run `pnpm --filter @kaiten/api-codegen run test` for generator changes. After
building Wasm, `pnpm run test:cel-engine:browser` exercises the actual app loader.
`pnpm run test:e2e:dev-mock` checks the dev command's bootstrap without a stack.
Application E2E uses MSW only; Firefox/WebKit execute the same handlers through
the in-page fallback with service workers blocked.
None of these are included in `check:ci`; report them separately.

For Storybook CI failures, inspect the `storybook-attempts-<SHA>` JSON/log
artifact: warmup and each shard attempt are separate. A retry must not hide a
failed assertion or collection error. The visual suite runs in one Linux Docker
job; the app suite keeps three Chromium shards plus Firefox/WebKit smoke.

## Workflow

1. List the scripts with `app/package.json`.
2. Run the baseline from `app/` and capture failures first.
3. Add what the change needs; the production bundle is already in the baseline:
   - Storybook tests for shared UI behavior changes;
   - the CEL engine tests and WebAssembly build (`pnpm run test:cel-engine`,
     `pnpm run build:ci`, then `pnpm run test:cel-engine:smoke`) when
     `app/cel-engine` changed;
   - Playwright e2e for navigation or workflow impact.
4. If a React-heavy change exists, run the React Doctor diagnostic
   (`pnpm exec react-doctor --verbose --scope changed`, under Extended commands).
5. Report findings in strict order:
   - blocking failures, flaky risks, warnings, then passes.
6. Provide rerun command set and smallest next fix sequence.

## Baseline commands

```bash
cd app
pnpm run generate   # only if src/api-client is missing or the API contract changed
pnpm run check:ci
```

## Extended commands

```bash
cd app
pnpm run test:stories          # Storybook tests (play functions + render smoke)
pnpm run test:cel-engine       # CEL engine crate tests: only when app/cel-engine changed (needs Rust)
pnpm run build:ci              # CEL engine to WebAssembly, then the bundle: only when app/cel-engine changed (needs Rust and wasm-pack)
pnpm run test:cel-engine:smoke # after build:ci: loads the built engine in Node
pnpm run test:e2e:app          # Playwright against the app (needs the browsers: pnpm exec playwright install chromium)
pnpm exec react-doctor --verbose --scope changed
```

## Output

- Pass or fail status per check.
- Blocking errors with file-level pointers.
- Recommended next command and fix order.
