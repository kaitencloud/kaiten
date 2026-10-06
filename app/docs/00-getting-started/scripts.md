# Scripts

`pnpm run check:lint-parity` compares root/app lint rule settings while preserving
their different source scopes; it is part of `check:ci`. The optional
`bash scripts/diagnose-file-sizes.sh` lists candidates over 200 lines for review.
It is a diagnostic, while `check:file-sizes` owns the official 350-line gate.

Every script is defined in [`app/package.json`](../../package.json). Run them from
`app/` with `pnpm run <script>`, after `pnpm install` at the repository root.

The scripts call `vp`, the Vite+ command line, and add flags to it: `dev` passes
`--port 3000`, and `test` runs only the `unit` Vitest project. Run the script, not
the bare `vp` command it wraps, or you get different behaviour.

Two scripts cover most days:

- `pnpm run generate` after a fresh clone, and whenever `app/openapi.yaml` or a
  GraphQL schema changes.
- `pnpm run check:ci` before a pull request.

## Run the app

| Script | What it does |
| --- | --- |
| `dev` | Starts the dev server on port 3000. |
| `dev:mock` | Starts the dev server on port 3000 for work without the stack: sign-in is bypassed, local auth included (`VITE_LOCAL_AUTH=false` overrides `app/.env.local`), and Mock Service Worker answers the whole API in the page (`VITE_MOCK_API=true`, `app/src/e2e/msw/dev.ts`), from one set of sample records every area shares (`app/src/e2e/msw/dev-world/`). The platform flags are off. A change lasts until the tab closes, or until a file of the mocks is saved, and the browser console warns about each API request the mocks do not serve. |
| `start` | Same as `dev`. |
| `build` | Builds the production bundle into `dist/`, then runs `tsc` (a type check: the tsconfig emits nothing). |
| `build:ci` | Builds the CEL engine to WebAssembly, then the production bundle. CI does the two as separate steps. |
| `build:wasm` | Compiles the CEL engine (`app/cel-engine`, Rust) into `public/wasm/`. Needs `cargo` and `wasm-pack`. The CEL editor uses it for its local syntax check. The Docker image builds the engine in its own stage and does not use this output. |
| `serve` | Serves the production build locally (`vp preview`). |
| `storybook` | Starts Storybook on port 6006. |
| `build:storybook` | Builds a static Storybook into `storybook-static/`. |

## Code generation

| Script | What it does |
| --- | --- |
| `generate` | Runs `generate-api-sdk`, then `generate-graphql`. **This is the one to run.** |
| `generate-api-sdk` | Generates the REST client (types, SDK, Zod schemas, TanStack Query options) from `app/openapi.yaml` into `src/api-client`, through the `@kaiten/api-codegen` workspace package. The same package then writes `src/lib/api/scopes.gen.ts`, the list of scopes a service account can hold, and `src/lib/api/operation-scopes.gen.ts`, the scope each operation requires. |
| `generate-graphql` | Generates the GraphQL client into `src/api-client/graphql` from the schemas under `api/internal`. |

`generate-api-sdk` on its own deletes `src/api-client/graphql`: the REST generator
cleans its whole output directory, and the GraphQL client lives inside it. Only
`generate` rebuilds both. `src/api-client` is git-ignored, and the rest of the
[generated files](../AI_CONTEXT.md#generated-code) are never edited by hand.

`task generate` at the repository root does more: it first rewrites
`app/openapi.yaml` from the Go source, then runs `pnpm run generate`.

## Lint, format and checks

| Script | What it does |
| --- | --- |
| `lint` | Runs Oxlint, type-aware, on `src` and `e2e`. Runs in CI. |
| `lint:fix` | Same, with `--fix`. |
| `fmt` | Formats `src` and `e2e` with Oxfmt. Tests, stories (files and `stories/` folders) and `*.queries.ts` files are excluded. |
| `fmt:check` | Reports what `fmt` would change, without writing. |
| `check` | `fmt:check`, then `vp check --no-fmt` (lint and type check) on `src` and `e2e`, then `check:architecture` and `check:file-sizes`. |
| `check:fix` | Same as `check`, applying the formatter and lint fixes. |
| `typecheck` | `tsc --noEmit` on the application. CI runs the same check. |
| `typecheck:e2e` | `tsc --noEmit` on the E2E suite (`tsconfig.e2e.json`). Runs in CI. |
| `check:architecture` | Enforces the [import rules](../AI_CONTEXT.md#import-rules) between layers. Runs in CI. |
| `check:e2e-contracts` | Builds every E2E scenario model and validates its seed against the API contract. Runs in CI. |
| `check:i18n-parity` | Fails when the `en` and `fr` key trees differ. Runs in CI. |
| `check:i18n-keys` | Fails when the code asks for a translation key that `en.ts` does not have. Runs in CI. |
| `check:api-error-i18n` | Fails when an API error code has no `Errors.api.<code>` translation. Runs in CI. |
| `check:file-sizes` | Fails when a source file exceeds 350 lines (tests, stories, `components/ui`, locales and generated code are exempt). Runs in CI. |
| `check:ci` | Chains the App CI checks, in the order of the workflow: `lint`, `typecheck`, `typecheck:e2e`, the six `check:*` guards (`check:architecture`, `check:e2e-contracts`, `check:i18n-parity`, `check:i18n-keys`, `check:api-error-i18n`, `check:file-sizes`), the token contrast check, `test` and `vp build`. It does not run `test:stories`, which App CI also runs. Run it before a pull request. |
| `react-doctor` | Scans the code with React Doctor (`react-doctor . -y --verbose --no-ami`). |

The [Checks](../AI_CONTEXT.md#checks) section of `AI_CONTEXT.md` says what each guard
protects.

## Unit and Storybook tests

The Vitest configuration has two projects: `unit` (jsdom, `*.test.ts(x)` files and
the script tests) and `storybook` (the stories, run in Chromium through the Storybook
Vitest addon).

| Script | What it does |
| --- | --- |
| `test` | Runs the `unit` project once. Runs in CI. |
| `test:watch` | Runs the `unit` project in watch mode. |
| `test:coverage` | Runs the `unit` project with V8 coverage. |
| `test:stories` | Runs the `storybook` project once. Needs Chromium. Runs in CI. |
| `test:stories:watch` | Runs the `storybook` project in watch mode. |
| `test:all` | Runs both projects once. |
| `test:all:coverage` | Runs both projects with coverage. |
| `test:cel-engine` | Runs the CEL engine crate's own tests (`cargo test --locked` in `app/cel-engine`). Needs Rust. Runs in CI, before the WebAssembly build. |
| `test:cel-engine:smoke` | Loads the module `build:wasm` wrote into `public/wasm/` in Node and validates finished and half-typed rules; fails if one of them aborts the engine. Run `build:wasm` first. Runs in CI, after the build. |

The two `test:cel-engine` scripts belong to neither project: they test the Rust CEL
engine, the first natively and the second through the module `build:wasm` built.
`test` does not run them, and neither does `check:ci`.

## End-to-end tests (Playwright)

There are two Playwright suites. `e2e/tests` drives Storybook (visual regression).
`e2e/app` drives the real app against mock network handlers (MSW) with the sign-in
bypassed: its dev server listens on port 3100.

| Script | What it does |
| --- | --- |
| `test:e2e` | Runs the Storybook suite (`playwright.config.ts`) on Chromium. Every test is skipped locally unless `VISUAL_TESTS=true` is set (CI sets `CI`). It starts Storybook on port 6006 itself; in CI, and with `VISUAL_TESTS=true` or `PLAYWRIGHT_STORYBOOK_STATIC=true`, it builds a static Storybook and serves it with `python3`. Runs in CI. |
| `test:e2e:all` | Same, on Chromium, Firefox, WebKit and Mobile Chrome. |
| `test:e2e:ui` | Same as `test:e2e`, in Playwright's UI mode. |
| `test:e2e:headed` | Same as `test:e2e`, with a visible browser. |
| `test:e2e:debug` | Same as `test:e2e`, in Playwright's debugger. |
| `test:e2e:report` | Opens the last HTML report. |
| `test:e2e:app` | Runs the application suite (`playwright.app.config.ts`). It starts its own dev server on port 3100 and refuses to reuse a running one. Runs in CI. |
| `test:e2e:codegen:app` | Starts Playwright's code generator on `http://127.0.0.1:3100`. It starts no server: run a dev server on that port yourself, as shown below the table. |
| `test:e2e:codegen:storybook` | Same, on `http://127.0.0.1:6006`. Start Storybook first. |
| `test:e2e:visual:update:linux` | Rewrites the visual-regression baselines inside the Linux Playwright Docker image that CI uses. Needs a running Docker daemon. Also available from the repository root. |

The dev server that `test:e2e:app` starts (`webServer` in
`playwright.app.config.ts`) is, from `app/`:

```bash
VITE_API_URL=/api VITE_E2E_BYPASS_AUTH=true VITE_E2E_MSW=true \
  pnpm exec vp dev --host 127.0.0.1 --port 3100
```

Started by hand for `test:e2e:codegen:app`, that server has no mocks. The specs
install them from the test (the console reads `window.__KAITEN_E2E_MSW__`), and the
dev server proxies `/api` nowhere, so the recorded page has no data to show.

## Coverage

| Script | What it does |
| --- | --- |
| `test:e2e:coverage:app` | Runs the application suite on Chromium with one worker and collects V8 coverage, then merges it. |
| `test:coverage:combined` | Runs `test:coverage`, then `test:e2e:coverage:app`. |
| `coverage:e2e:clean` | Deletes the collected E2E and combined coverage. |
| `coverage:merge` | Merges the unit coverage (`coverage/`) and the E2E coverage into a summary in `.coverage/combined/`. |

No coverage threshold is enforced and CI does not collect coverage: the numbers are
informational.

## Repository root scripts

The root [`package.json`](../../../package.json) has a few scripts that span the
whole workspace. Run them from the repository root with `pnpm run <script>`.

| Script | What it does |
| --- | --- |
| `check` | `vp check` over the workspace, then `check:architecture` in `app/` and the token contrast check. |
| `check:fix` | `vp check --fix`, then `check:architecture`. |
| `lint`, `lint:fix` | Oxlint over the workspace, without and with `--fix`. |
| `fmt`, `fmt:check` | Oxfmt over the workspace, writing or only checking. |
| `check:contrast` | Fails when a foreground and background pair used by the UI is below the WCAG AA contrast floor, in either theme. |
| `test:e2e:visual:update:linux` | Runs the script of the same name in `app/`. |

`task --list` shows the Taskfile tasks (stack, code generation, backend tests). The
root [README](../../../README.md#development-tasks) explains them.
