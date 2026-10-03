# End-to-end tests

`e2e/` holds three Playwright suites:

| Folder | Suite | Config | What it does |
| --- | --- | --- | --- |
| `e2e/app/` | Application | `playwright.app.config.ts` | Drives the real console in Chromium, signed in by bypass, with the API served by Mock Service Worker (MSW). |
| `e2e/tests/` | Storybook | `playwright.config.ts` | Visual regression: compares screenshots of stable stories with committed baselines. |
| `e2e/stack/` | Authenticated stack | `playwright.stack.config.ts` | Real API, PostgreSQL, gateway, signed local identity and SSE. |

Interactions of an isolated component do not belong in Playwright. Write them as a story with a `play` function, run by `pnpm run test:stories`. The [testing documentation](../docs/06-testing/README.md) says how to choose between the kinds of test, and [integration tests](../docs/06-testing/integration-tests.md) explains how each suite runs.

Every command on this page runs from `app/`. Install Chromium once with `pnpm exec playwright install chromium`, and run `pnpm run generate` on a fresh clone: the mock models validate their data against the generated API client.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm run test:e2e:app` | Runs the application suite. Playwright starts the dev server itself on port 3100, which must be free. |
| `pnpm run test:e2e:stack` | Builds an isolated Compose stack, runs five authenticated smokes, and removes its data. Needs Docker. |
| `pnpm run test:e2e:dev-mock` | Runs the real dev mock command and verifies its seeded world after reload. No stack. |
| `pnpm run test:cel-engine:browser` | After `build:wasm`, tests the app's loader and half-typed CEL rules in Chromium. |
| `pnpm run test:e2e` | Runs the Storybook suite. Every test is skipped unless `CI` or `VISUAL_TESTS=true` is set. |
| `VISUAL_TESTS=true pnpm run test:e2e` | Builds a static Storybook, serves it on port 6006 with `python3` and runs the visual tests. |
| `pnpm run test:e2e:visual:update:linux` | Rewrites the visual baselines in the Linux Playwright Docker image. Needs a running Docker daemon, and also runs from the repository root. |
| `pnpm run test:e2e:coverage:app` | Runs the application suite with V8 coverage. See [coverage](../docs/06-testing/coverage.md). |
| `pnpm run test:e2e:report` | Opens the last HTML report. |
| `pnpm run test:e2e:codegen:app`, `pnpm run test:e2e:codegen:storybook` | Open Playwright's code generator on `http://127.0.0.1:3100` or `http://127.0.0.1:6006`. See [Codegen](#codegen). |

[Scripts](../docs/00-getting-started/scripts.md) lists the rest.

The application web server explicitly disables local auth and the dev mock
switches, enables E2E bypass/MSW, and clears the platform flag service settings.
The standard command works even when the shell or `.env.local` enables local
auth. It starts a fresh server every time.

The default app project is Chromium. `ALL_BROWSERS=true pnpm run test:e2e:app
--project=firefox --project=webkit` runs the focused browser smoke (read,
navigation, form, initial focus and focus return). These projects block service
workers and use MSW's in-page fallback; notification SSE is tested on the real
stack. App E2E CI explicitly selects Chromium for its full shards and both
other engines for a separate smoke job. Storybook's collected reference stories
have blocking Axe checks; the Linux Chromium visual suite keeps its existing
baselines.

To run part of the application suite, or to debug it, call Playwright with the app config:

```bash
pnpm exec playwright test -c playwright.app.config.ts e2e/app/customers
pnpm exec playwright test -c playwright.app.config.ts e2e/app/customers/customers.read.spec.ts --ui
pnpm exec playwright test -c playwright.app.config.ts e2e/app/customers/customers.read.spec.ts --headed
pnpm exec playwright test -c playwright.app.config.ts e2e/app/customers/customers.read.spec.ts --debug
```

The `test:e2e:ui`, `test:e2e:headed`, `test:e2e:debug` and `test:e2e:all` scripts read the default config, `playwright.config.ts`: they act on the Storybook suite.

Before you push a change to `e2e/`, run `pnpm run lint`, `pnpm run typecheck:e2e` and `pnpm run check:e2e-contracts`. App CI runs all three.

## Structure

```txt
e2e/
├── app/
│   ├── _support/             # what the specs of every pack build on, one file per area
│   │   ├── app-test.ts       # `test` and `expect` for specs, with optional V8 coverage
│   │   ├── coverage.ts
│   │   ├── assertions/       # shared expectations: toasts, accessibility, tracked events
│   │   ├── contracts/        # parseContract: checks a model's data against the generated Zod schemas; parseAuditEventContract: the same for an audit trail event, by its name
│   │   ├── drivers/          # page objects for screens, dialogs and forms
│   │   ├── fixtures/         # builders for reusable entities
│   │   ├── mocks/            # install-*-app-mocks.ts: put a model's state into the page
│   │   └── model/            # in-memory state behind the mocks
│   └── <pack>/               # one folder per object, workspace or cross-cutting concern
│       ├── <pack>.scenarios.ts   # test data, where the pack owns some
│       └── <subject>.<intent>.spec.ts
├── tests/
│   ├── _storybook-helpers.ts
│   ├── visual-regression.spec.ts
│   └── visual-regression.spec.ts-snapshots/chromium/   # the baselines
└── AI_E2E_GUIDE.md
```

The packs under `e2e/app/` fall in three groups:

- **Objects**, one folder each: `customers/`, `entitlements/`, `feature-flags/`, `instances/`, `licenses/`, `connectors/`.
- **A workspace**: `release-management/` covers releases, components and deployment zones together, because they form one workspace with shared state.
- **Read-only and cross-cutting checks**: `audit-trail/`, `dashboard/`, `notifications/`, `accessibility/` (axe), `i18n/` and `mobile/` (a Pixel 5 viewport).

## Write an application spec

The rules the packs follow:

1. A simple object gets its own folder. A sub-domain that spans several features gets one workspace folder, as `release-management/` does.
2. Specs are named `<subject>.<intent>.spec.ts`. The subject is the pack or, in a workspace folder, the object the spec covers (`releases.create.spec.ts` in `release-management/`). The intent is what the user does or what the spec checks: `read`, `create`, `update`, `delete`, `errors`, `deploy`, `toggle`, `lifecycle`, `display-order` and so on. One spec file states one intention; a significant variant goes in its own file, not in a long test. `accessibility/` holds a single `accessibility.spec.ts`.
3. A pack that owns test data keeps it next to its specs in `<pack>.scenarios.ts`, as factories such as `createCustomersListModel()` that return a seeded model. `accessibility/`, `i18n/` and `mobile/` have none: they import the scenarios of the packs whose screens they visit.
4. `_support/` holds the drivers, mock installers, models and fixtures of every pack, one per area, even when a single pack uses them. Look there before you write a helper, and reuse a driver or a model instead of copying it into a spec.
5. Mocks are stateful. A create, an update or a deploy changes the model, and the screens that depend on it read the change back.
6. Locate elements by role, label, visible text or URL, and avoid CSS selectors. Hide an interaction that is fragile and recurrent in a driver.
7. Assert what the user sees: the URL, the heading, a toast, a row, a badge, an error message.
8. Import `test` and `expect` from `../_support/app-test`, not from `@playwright/test`, so that coverage collection works.

A spec, trimmed from `e2e/app/customers/customers.read.spec.ts`:

```ts
import { test } from '../_support/app-test';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { createCustomersListModel } from './customers.scenarios';

test.describe('customers read', () => {
  test('renders the customers list and filters by search text', async ({
    page,
  }) => {
    const model = createCustomersListModel();
    const list = new CustomersListDriver(page);

    await installCustomerAppMocks(page, model);
    await list.goto();

    await list.expectCustomerVisible('Acme Corp');
    await list.search('Beta');
    await list.expectCustomerHidden('Acme Corp');
  });
});
```

To test a failure, arm the model so that its next call fails, as `e2e/app/customers/customers.errors.spec.ts` does:

```ts
model.setNextCreateError(500); // the next create call answers with a 500
```

Most models keep the pending errors in an `ErrorInjector` (`e2e/app/_support/model/error-injector.ts`).

## Mock a new area

The mechanism is in [network mocks](../docs/06-testing/integration-tests.md#network-mocks-msw). A new area that specs must mock needs, in order:

1. A model class in `e2e/app/_support/model/<area>-app-model.ts`, with `static fromSerialized(...)` and `serializeForMsw()`. It imports nothing from Playwright, because `src/e2e/msw/` imports it too.
2. A `*-handlers.ts` set in `src/e2e/msw/`, registered by `browser.ts`. The bootstrap owns assembly, not object logic; `persistence.ts` owns sessionStorage updates. Build a REST handler from the operation's generated handler in `@/api-client/msw.gen` (`handleGetCustomer(...)`) rather than `http.get` and a path.
3. The slot's serialized payload in `e2e/app/_support/contracts/msw-slots.ts`. `MswSlotKey` derives from this canonical shape; installers are typed against each slot's model serialization.
4. An installer, `e2e/app/_support/mocks/install-<area>-app-mocks.ts`, that calls `installMswMocks(page, '<slot>', model)`.
5. Its scenario factories in `e2e/app/_support/scenario-registry.ts`, the canonical browser-free inventory. `scripts/check-e2e-contracts.ts` executes it through `pnpm run check:e2e-contracts`. Register explicit variants for factories with parameters; do not maintain a second list in another check.

MSW is the only mock implementation. `contracts/mock-transport.spec.ts` checks
wire statuses, bodies, one-shot failures and reload state. CI runs the full
Chromium suite, including notifications, in three shards. Firefox/WebKit use
the same handlers through MSW's in-page fallback when service workers are blocked.
Bootstrap results use separate output folders so concurrent local runs cannot
delete each other's trace artifacts.
Shared error mapping is in
`_support/contracts/mock-http.ts` and shared GraphQL operations in
`_support/model/graphql-operations.ts`. Models stay stateful and transport-neutral.
Handler order, fallbacks, statuses and reload persistence are preserved by the
structural split. See [browser mock adapter](../src/e2e/msw/README.md).

### Mock policy

- **Full E2E:** strict. `handlers.ts` assembles the same handlers in the browser
  and Node contract tests, with installed owners before sibling fallbacks.
  `shell-handlers.ts` declares empty sidebar preloads and notifications only
  after those owners. An undeclared `/api` call ends in a network error naming
  its method, URL and GraphQL operation; `app-test.ts` fails the test on it.
- **Dev world:** `dev:mock` installs its shared model seeds, warns on an
  undeclared API call, and passes it through. Its inventory and cross-record
  consistency run under Vitest because its domain imports need Vite's env.
- **Partial notifications on a real stack:** only notifications are mocked;
  business API and platform flags pass through.

Integration read-only stubs use the `integrationStubs` slot in strict MSW.
The dashboard error case is carried by the
dashboard model. A new scenario factory exported from any `*.scenarios.ts`
must appear in the registry: `check:e2e-contracts` discovers omitted factories
and new packs. The platform flags and read-only stubs are not business models.

## Authenticated stack

`scripts/test-stack.mjs` reuses the repository's Compose stack, under a random
project name with free host ports and a temporary credentials directory. It
reads the JIT-provisioned second tenant's ID from its isolated database, rather
than duplicating the backend's ID derivation. Tokens use HMAC-SHA-256 with a
per-run secret. It builds the API/seeder/migrator, waits for gateway readiness,
seeds local accounts,
and provisions a second tenant through JIT using a JWT signed with the run's
own secret. All API mocks and auth bypasses are disabled. It tests UI creation
and reload, missing/insufficient credentials, cross-tenant isolation, release
deployment read through REST and GraphQL, real notification SSE by cookie, and
organization switching. The switch uses the app's real local-account picker.

The runner removes its containers, volumes, network and temporary credentials
in `finally`; existing local stacks are independent. Failed traces/screenshots
are in `stack-test-results/`, the report in `stack-playwright-report/`.
`.github/workflows/app-stack.yml` runs a dedicated job on PRs touching these
boundaries. `check:ci` does not run this Docker/browser suite.

## Visual regression

`e2e/tests/visual-regression.spec.ts` opens stories by id and compares screenshots. To add a test, pick a stable story, wait for something visible, assert `toHaveScreenshot('<name>.png')`, run `pnpm run test:e2e:visual:update:linux` and commit the new baseline. The baselines are rendered on Linux because CI compares them there. [Integration tests](../docs/06-testing/integration-tests.md#visual-regression) has the details, including how a story id is built.

## Codegen

Playwright's code generator records a real flow, and gives you raw code to turn into a driver and a spec.

For Storybook:

```bash
pnpm run storybook
pnpm run test:e2e:codegen:storybook    # in a second terminal
```

For the application, `test:e2e:codegen:app` opens `http://127.0.0.1:3100` and starts no server. The dev server of the application suite has the sign-in bypass but no mocks, because a spec installs them from the test: the page shows no data.

```bash
VITE_API_URL=/api VITE_LOCAL_AUTH=false VITE_E2E_BYPASS_AUTH=true VITE_E2E_MSW=true \
  pnpm exec vp dev --host 127.0.0.1 --port 3100
pnpm run test:e2e:codegen:app          # in a second terminal
```

To record against real data instead, start the whole stack with `task dev` from the repository root, and run `pnpm exec playwright codegen http://localhost:3000`.

The generated code is notes, not a spec. Before you commit:

- replace generated selectors with roles, labels, visible text or a deliberate `data-testid`;
- move repeated interactions into a driver in `_support/drivers`;
- move the data into a scenario and its model;
- assert what the user sees: URL, heading, toast, row, badge, error message;
- run the spec alone with `pnpm exec playwright test -c playwright.app.config.ts <path>`.

## When a run fails

Playwright keeps the trace, the screenshot and the video of a failed test and writes an HTML report to `playwright-report/`; `pnpm run test:e2e:report` opens it, and the trace attached to the failed test replays it step by step.

In CI, the workflow (`.github/workflows/app-e2e.yml`) uploads the report of a failed shard as an artifact, `playwright-app-report-shard-<n>` or `playwright-storybook-report-shard-<n>`. For a pull request from this repository it also builds a preview of the failed reports with `app/scripts/build-playwright-trace-preview.sh`, publishes it to GitHub Pages when the repository has Pages enabled, and comments on the pull request; without Pages, the comment says how to download the artifact. [CI/CD](../docs/07-deployment/ci-cd.md) describes the workflow.

Two runs of the Storybook suite on one machine share port 6006: run one at a time. A Storybook dev server can answer 504 "Outdated Optimize Dep" on the first request after its dependency cache changes; `openStorybookStory` makes up to three attempts, and a static build (`PLAYWRIGHT_STORYBOOK_STATIC=true`) avoids it.

## Writing specs with an AI assistant

[`AI_E2E_GUIDE.md`](./AI_E2E_GUIDE.md) holds ready-to-copy prompts and templates for an assistant that writes or completes an E2E spec, and for turning a manual flow into one. Give the assistant that guide, the exact target file, the business object, and whether it is an `e2e/app` spec or a Storybook one. Ask it to reuse `_support/` before it creates a helper, to keep mocks stateful for any create, update or delete, and to assert on the URL, the heading, the toast and the final visible state.

## Resources

- [Playwright documentation](https://playwright.dev/)
- [Mock Service Worker](https://mswjs.io/)
