# Test baseline — 2026-10-03

Measured on `7a4bdb02475b10b9753c758e93921d93ec0801ae`, after PRs #11,
#13 and #14. This is the starting point for the test hardening work.
Commands below run from `app/`, after `pnpm install --frozen-lockfile` at the
repository root and `pnpm run generate`.

This is a historical measurement. The `E2E_MOCKS` switch and Playwright
`page-route` adapter were subsequently removed; use `pnpm run test:e2e:app`
for the current MSW-only suite. The original commands/results below are retained
to keep the baseline attributable to its revision.

## Environment

macOS, Node 24.21.0, pnpm 12.4.1, Vite+ 1.0.0, Vitest 5.0.1,
Playwright 1.63.0, Chromium 1243. The generated REST, GraphQL and MSW clients
are present. Docker is available; Cargo and wasm-pack are absent from PATH.

The local checkout enables `VITE_LOCAL_AUTH` in `.env.local`. The baseline
commands therefore override it. Other behaviour switches are `VITE_API_URL`,
`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_KAITEN_PLATFORM_API_URL`,
`VITE_KAITEN_PLATFORM_FLAGS_TOKEN`, `VITE_E2E_BYPASS_AUTH`, `VITE_E2E_MSW`,
`VITE_MOCK_API`, `VITE_MOCK_NOTIFICATIONS` and `E2E_MOCKS`. No credentials are
included in this report.

## Results

| Command | Result | Duration |
| --- | --- | --- |
| `VITE_LOCAL_AUTH=false VITE_E2E_BYPASS_AUTH=false pnpm run test:coverage --maxWorkers=4` (first pass) | 189 files, 1,515 collected; 1,514 passed, token-create form timed out | 201.34 s |
| Same command (warm cache) | 1,514 passed; deploy-release dialog failed to find options after opening the select | 36.70 s |
| `VITE_LOCAL_AUTH=false VITE_E2E_BYPASS_AUTH=false pnpm run test:coverage --maxWorkers=4 --coverage.reportOnFailure` | All 189 files and 1,515 tests passed | 127.86 s |
| `VITE_LOCAL_AUTH=false pnpm run test:stories` | All 67 files and 244 stories passed | 27.00 s |
| `VITE_LOCAL_AUTH=false E2E_MOCKS=msw pnpm run test:e2e:app --workers=4` | All 111 passed; no retries | 2.6 min (runner summary) |
| `VITE_LOCAL_AUTH=false E2E_MOCKS=page-route pnpm run test:e2e:app --workers=4` | 103 passed, 8 notification cases skipped by design; no retries | 2.6 min (runner summary) |

The last unit run measured 70.59% statements, **61.68% branches**, 66.90%
functions and **70.92% lines**. Exclusions: generated clients, router tree,
`e2e`, `__tests__`, UI primitives, routes and stories. Browser results are
separate, and do not contribute to these percentages. The dev world and MSW
handlers are excluded by `**/e2e/**`, even though their unit tests run.

Both unit failures disappeared on a later full run, without a source change.
The select failure also occurs on a warm cache; it must not be classified as
dependency-optimizer warmup. Timings include different local load and are not
a benchmark.

## Warnings and scope changes

Unexpected output remains: React `act` warnings, slider DOM-property warnings,
chart SVG elements rendered outside an SVG in a unit stub, missing router
providers in service-account stories, ResizeObserver loops in application
forms, and GraphQL 404s after notification navigation. These are follow-ups
for mock completeness and suite reliability. Intentionally injected API errors
also log their status and message. Storybook reports an ignored Vite hook from
the Vitest mock-interceptor plugin.

The old audit percentages are not comparable: the structure work removed
unused AST/rule-builder code and facade modules, and moved tests with their
owners. Since #11, #12 added a styles regression, #13 added six dev-world
cases and converted API tests to MSW, dropping tests of mocked implementation
details. #14 repaired the paginated legacy responses and GraphQL routing.
The current file/test inventory, rather than the earlier audit's 1,543 tests,
is the baseline for subsequent comparisons.
