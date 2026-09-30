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
import { storyCustomerRows } from '@/test-fixtures/p0-storybook-fixtures';
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
- `src/test-fixtures/` holds what stories share: `StorybookRouter` (a router on a memory history, which can seed the query cache), fixture data and the finders of visible elements in `storybook-test-utils.ts`.
- A story you add is a test at once. The stories coupled to the router, to forms, to queries or to the API, and those that pull heavy dependencies (charts, the CEL editor), are listed in `storybookTestExclude` in `app/vite.config.ts`. The runner never imports them and Storybook still shows them; their behaviour is left to the [application suite](#application-e2e-e2eapp).
- Accessibility checks from `@storybook/addon-a11y` are set to `todo` in `.storybook/preview.tsx`: violations show in the Storybook UI and do not fail a test. `e2e/app/accessibility/accessibility.spec.ts` checks the main screens with axe in the application suite.

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
VITE_API_URL=/api VITE_E2E_BYPASS_AUTH=true VITE_E2E_MSW=true pnpm exec vp dev --host 127.0.0.1 --port 3100
```

Locally, the suite needs the installed dependencies, the generated client, Chromium and a free port 3100. It refuses to reuse a server that already runs there (`reuseExistingServer: false`). It needs no backend, no Docker and no Clerk key: `VITE_E2E_BYPASS_AUTH=true` renders the console without signing in, and `VITE_E2E_MSW=true` serves the API from the mocks below. A test has 60 seconds, because the dev server transforms modules on demand.

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
2. The installer calls `tryInstallMswMocks(page, 'customers', model)` (`e2e/app/_support/mocks/install-app-mocks.ts`). It adds an init script that stores the model's serialised state under a slot of `window.__KAITEN_E2E_MSW__` and in `sessionStorage`, before the page's own scripts run.
3. `src/main.tsx` sees `VITE_E2E_MSW=true` and that object, imports `src/e2e/msw/browser.ts` and starts the worker (`public/mockServiceWorker.js`) before it renders. The `E2EMswConfig` type in that file lists the slots. Each model slot rebuilds its model with `fromSerialized` and gets REST and GraphQL handlers from it.
4. A mutation changes the model in the browser and writes it back to `sessionStorage`, so a reload in the same tab keeps the change. The next test gets a fresh browser context, hence fresh state.
5. A request that no handler matches is bypassed (`onUnhandledRequest: 'bypass'`). The dev server has no API behind it, so an unmocked call gets no usable answer: install the slot the page needs.

The model classes in `e2e/app/_support/model/` are plain TypeScript with no Playwright import, because both the specs and `src/e2e/msw/` import them. Most of them validate their seed against the generated Zod schemas (`e2e/app/_support/contracts/openapi-contract.ts`), and `pnpm run check:e2e-contracts` instantiates the scenario factories to catch a seed that no longer matches the API contract.

`E2E_MOCKS=page-route pnpm run test:e2e:app` switches every installer to Playwright's `page.route` interception instead. It is a way to tell an MSW problem from an app problem. The notifications slot has no such fallback, because Playwright's `page.route` cannot serve its event stream: its installer throws.

`VITE_MOCK_NOTIFICATIONS=true` is a separate switch. It serves only the notifications endpoints from mocks while everything else reaches the real API: see [environments](../07-deployment/environments.md).

## Related pages

- [`app/e2e/README.md`](../../e2e/README.md): the layout of `e2e/`, the writing rules, how to add a mock slot, codegen.
- [Coverage](./coverage.md): collecting coverage from the unit tests and from the application suite.
- [Scripts](../00-getting-started/scripts.md): every `test:*` script.
