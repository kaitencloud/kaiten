# Integration tests

Three suites run the console in a browser, above the [unit tests](./unit-tests.md):

- the Storybook tests, where each story is a test, run by Vitest;
- the visual regression suite, which compares screenshots of stories, run by Playwright;
- the application E2E suite, which drives the real console with a mocked API, run by Playwright.

The layout of `e2e/` and the rules for writing an E2E spec are in [`app/e2e/README.md`](../../e2e/README.md). Every command below runs from `app/`, and the [testing overview](./README.md#before-you-run-anything) lists what to install first.

## Storybook tests

`pnpm run test:stories` runs the `storybook` project of the Vitest configuration in `app/vite.config.ts`. The Storybook Vitest addon turns each story that `.storybook/main.ts` finds (`src/**/*.stories.*`) into a test in headless Chromium, with a 1200 by 900 viewport. The test renders the story, then runs its `play` function if it has one. A story without `play` is a render smoke test.

A story file lives in a `stories/` folder beside the component it shows, for example `src/features/customers/components/stories/customer-table.stories.tsx`:

```tsx
// src/features/customers/components/stories/customer-table.stories.tsx (trimmed)
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { storyCustomerRows } from '@/test-fixtures/storybook-fixtures';
import { CustomersTable } from '../customer-table';

const meta = {
  title: 'Features/Customers/CustomerTable',
  component: CustomersTable,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof CustomersTable>;

export default meta;
type Story = StoryObj<typeof CustomersTable>;

export const Default: Story = {
  render: () => (
    <StorybookRouter>
      <CustomersTable customers={storyCustomerRows} />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('Acme Corp')).toBeVisible();
  },
};
```

What a story gets:

- `.storybook/preview.tsx` wraps every story in a fresh `QueryClient` (no retries, data never stale), an `I18nextProvider`, the `ThemeProvider` and a `TooltipProvider`, and adds a light and dark switch. A component that needs another context provides it in the story or in a local decorator.
- The API is answered by Mock Service Worker in the page, which the preview's loader enables (`.storybook/msw.ts`). See [the API of a story](#the-api-of-a-story).
- `src/test-fixtures/` holds what stories share: `StorybookRouter` (a router on a memory history), the shared handlers of `storybook-handlers.ts`, fixture data and the finders of visible elements in `storybook-test-utils.ts`.
- A story you add is a test at once. The stories coupled to the router, to forms, to queries or to the API, and those that pull heavy dependencies (charts, the CEL editor), are listed in `storybookTestExclude` in `app/vite.config.ts`. The runner never imports them and Storybook still shows them; their behaviour is left to the [application suite](#application-e2e-e2eapp).
- Accessibility checks from `@storybook/addon-a11y` are set to `todo` in `.storybook/preview.tsx`: violations show in the Storybook UI and do not fail a test. `e2e/app/accessibility/accessibility.spec.ts` checks the main screens with axe in the application suite.

### The API of a story

A component reads its data as in the app, through its queries, and the story declares what the API answers in `parameters.msw.handlers`, for the whole file in `meta` or for one story:

```tsx
// src/features/entitlements/components/stories/entitlement-form-dialog.stories.tsx (trimmed)
import { handleListEntitlementGroups } from '@/api-client/msw.gen';
import { onePage } from '@/test-fixtures/storybook-handlers';

const meta = {
  title: 'Features/Entitlements/EntitlementFormDialog',
  component: EntitlementFormDialog,
  parameters: {
    msw: {
      handlers: [handleListEntitlementGroups(onePage(storyEntitlementGroups))],
    },
  },
} satisfies Meta<typeof EntitlementFormDialog>;
```

- A REST endpoint takes its generated handler from `@/api-client/msw.gen`, whose body has the type of the operation's response. `onePage(items)` is the body of a list that fits on one page.
- GraphQL goes through `graphqlOperationHandler` from `@/e2e/msw/handler-factory`, keyed by operation name; `metadataFieldsHandler(...)` (`src/test-fixtures/storybook-handlers.ts`) serves the active metadata fields of each resource type, none by default.
- A request to `/api/` that no handler answers fails with a network error, and a console error names it: the story shows the error state its component has for an API that is down. It never reaches the Storybook server or a running stack. The one default is the billing capabilities, answered with billing off because the app shell reads them: a story that needs billing on declares `handleGetBillingCapabilities` itself, with a profile of `e2e/app/_support/model/billing-capabilities.ts`.
- The data arrives after the first render: a `play` function waits for it with `findBy*`, as it would for any data loaded over the network.
- The handlers belong to the page, not to a story: a docs page that renders several stories at once serves them all with the last one's.
- Mock Service Worker patches `fetch` and `XMLHttpRequest` in the page (`createPageNetwork`, `src/e2e/msw/page-network.ts`, over `msw/experimental`), with no service worker: a service worker would also route every module the Storybook tests import through a round trip to the page, and some of those imports failed under that load.
- `StorybookRouter`'s `seed` fills the cache with what no request answers in Storybook: a platform flag, whose source needs a signed-in user (`side-nav.stories.tsx`).

In App CI, the `stories` job runs the suite after a throwaway pass that fills Vite's dependency-optimizer cache: on a cold cache the browser runner reloads in the middle of a run and drops stories. It then runs the project in three shards, each retried once. A local run has a warm cache after its first pass; if the first one fails with "Cannot connect to the iframe" or "Failed to fetch dynamically imported module", run it again.

## Visual regression

`e2e/tests/visual-regression.spec.ts` is the one spec of `playwright.config.ts`. With `_storybook-helpers.ts`, it opens stories by id in Storybook's iframe and compares screenshots of the page with the baselines committed in `e2e/tests/visual-regression.spec.ts-snapshots/chromium/`. The comparison tolerates 0.1% of differing pixels (`maxDiffPixelRatio`).

- **Story ids.** An id is the story title in lower case with `/` turned into `-`, then `--` and the export name in kebab case: `Features/Customers/CustomerTable` and `Default` give `features-customers-customertable--default`. Renaming a story's title or export breaks its screenshot test.
- **Running it.** Outside CI, the whole file is skipped unless `VISUAL_TESTS=true`, so a bare `pnpm run test:e2e` runs no test on your machine. `VISUAL_TESTS=true pnpm run test:e2e` builds a static Storybook and serves it on port 6006 with `python3 -m http.server`: it needs `python3` and a free port 6006.
- **Baselines.** CI compares against baselines rendered on Linux, inside the Playwright Docker image, so the pixels match. `pnpm run test:e2e:visual:update:linux` rewrites them the same way; it needs a running Docker daemon, and runs from `app/` or from the repository root. Commit the changed PNGs with the change that caused them, and look at the difference first.
- **Adding a test.** Pick a story that is stable, open it with `openStory(page, '<story-id>')`, wait for something visible, assert `toHaveScreenshot('<name>.png')`, then run the update script and commit the new baseline.

## Application E2E (`e2e/app`)

The application suite runs the real console in Chromium with the sign-in bypassed and the API served by mocks. It checks what neither a unit test nor a story can: routes, dialogs driven by the URL, create, update and delete flows, the refresh of a list after a mutation, server errors, accessibility, i18n and a mobile viewport.

`pnpm run test:e2e:app` reads `playwright.app.config.ts`, which starts its own dev server:

```bash
VITE_API_URL=/api VITE_LOCAL_AUTH=false VITE_E2E_BYPASS_AUTH=true VITE_E2E_MSW=true pnpm exec vp dev --host 127.0.0.1 --port 3100
```

Locally, the suite needs the installed dependencies, the generated client, Chromium and a free port 3100. It refuses to reuse a server that already runs there (`reuseExistingServer: false`). It needs no backend, no Docker and no Clerk key: `VITE_LOCAL_AUTH=false` prevents a local setting from selecting the sign-in gate, `VITE_E2E_BYPASS_AUTH=true` renders the console without signing in, and `VITE_E2E_MSW=true` serves the API from the mocks below. The server also disables dev mocks and clears the platform flag service settings. A test has 60 seconds, because the dev server transforms modules on demand.

Run one folder or file with the app config:

```bash
pnpm exec playwright test -c playwright.app.config.ts e2e/app/customers
pnpm exec playwright test -c playwright.app.config.ts e2e/app/customers/customers.read.spec.ts --headed
```

`test:e2e:ui`, `test:e2e:headed`, `test:e2e:debug`, `test:e2e:report` and `test:e2e:all` use the default config, `playwright.config.ts`, which is the Storybook suite. To debug an application spec, pass `-c playwright.app.config.ts` and `--ui`, `--headed` or `--debug` to `pnpm exec playwright test` as above.

A failed test keeps its trace, screenshot and video, and Playwright writes an HTML report to `playwright-report/`; `pnpm run test:e2e:report` opens the last one. CI runs the suite in three shards, retries a failure once and uploads the report of a failed shard. [CI/CD](../07-deployment/ci-cd.md) describes the workflow.

## Network mocks (MSW)

The application suite serves the API with [Mock Service Worker](https://mswjs.io/), which runs inside the page. The mocked state lives in models the specs create, and the browser rebuilds them.

1. A spec builds a model from a scenario factory, for example `createCustomersListModel()` in `e2e/app/customers/customers.scenarios.ts`, and calls the installer of its area, `installCustomerAppMocks(page, model)`.
2. The installer calls `installMswMocks(page, 'customers', model)` (`e2e/app/_support/mocks/install-app-mocks.ts`). It adds an init script that stores the model's serialised state under a slot of `window.__KAITEN_E2E_MSW__` and in `sessionStorage`, before the page's own scripts run.
3. `src/main.tsx` sees `VITE_E2E_MSW=true` and that object, imports `src/e2e/msw/browser.ts` and starts the worker before it renders. The worker script, `/mockServiceWorker.js`, comes from the installed `msw` package: the `msw/vite` plugin of `app/vite.config.ts` serves it, so it cannot fall behind an upgrade. The canonical `E2EMswConfig` in `e2e/app/_support/contracts/msw-slots.ts` lists serialized slots. Each slot rebuilds its model with `fromSerialized`; its object-specific `*-handlers.ts` set handles transport. Its REST handlers are the ones generated from the OpenAPI contract (`@/api-client/msw.gen`), given a resolver that reads the model: a path or a param that the contract renames breaks the type check, not a spec at run time. The bootstrap owns registration order and puts explicit fallbacks after installed owners.
4. A mutation changes the model in the browser; `src/e2e/msw/persistence.ts` writes it back to `sessionStorage`, so a reload in the same tab keeps the change. The next test gets a fresh browser context, hence fresh state.
5. An API request that no declared handler matches ends in a network error naming the request. The shared Playwright fixture fails the test: install the slot the page needs.

The model classes in `e2e/app/_support/model/` are plain TypeScript with no Playwright import, because both the specs and `src/e2e/msw/` import them. Most of them validate their seed against the generated Zod schemas (`e2e/app/_support/contracts/openapi-contract.ts`), and `pnpm run check:e2e-contracts` instantiates the scenario factories to catch a seed that no longer matches the API contract.

MSW is the only mock implementation. Firefox and WebKit block service workers
and use `src/e2e/msw/page-network.ts`, which executes the same MSW handlers inside
the page. This fallback intercepts fetch/XHR, not notification EventSource streams;
SSE authentication is verified by the real-stack suite.

Two other switches start the same worker outside the suite, see [environments](../07-deployment/environments.md). `VITE_MOCK_API=true` (`pnpm run dev:mock`) installs every slot, for work on the interface without the stack. Its slots come from the same models, but not from the scenarios: each is seeded from one world of records that all the areas share (`src/e2e/msw/dev-world/`), so that a link from one area leads to a record the other one serves. A unit test, `src/__tests__/dev-world.test.ts`, builds the world through the models, which check each seed against the contract, and checks that every reference between areas resolves. `VITE_MOCK_NOTIFICATIONS=true` serves only the notifications endpoints from mocks while everything else reaches the real API.

Full application E2E is strict: an API request without a declared model or
explicit shell fallback produces a named network error and fails the test.
Dev-world requests warn and pass through; partial notifications preserve the
real API and flags. Read-only integration stubs are explicit MSW slots in E2E.
The [mock policy](../../e2e/README.md#mock-policy) and transport contract specs
describe the owners, fallbacks and reload checks.

Installed together, the slots answer for what they own: a slot's stubs for another area's resources are fallbacks, which answer only when no installed slot owns the resource.

## Related pages

- [`app/e2e/README.md`](../../e2e/README.md): the layout of `e2e/`, the writing rules, how to add a mock slot, codegen.
- [Coverage](./coverage.md): collecting coverage from the unit tests and from the application suite.
- [Scripts](../00-getting-started/scripts.md): every `test:*` script.
