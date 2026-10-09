# End-to-end tests

`e2e/` holds three Playwright suites:

| Folder | Suite | Config | What it does |
| --- | --- | --- | --- |
| `e2e/app/` | Application | `playwright.app.config.ts` | Drives the real console in Chromium, signed in by bypass, with the API served by Mock Service Worker (MSW). |
| `e2e/tests/` | Storybook | `playwright.config.ts` | Visual regression: compares screenshots of stable stories with committed baselines. |
| `e2e/stack/` | Authenticated stack | `playwright.stack.config.ts` | Real API, PostgreSQL, gateway, signed local identity and SSE; and the billing screens against what the API composes and decides itself. |

Interactions of an isolated component do not belong in Playwright. Write them as a story with a `play` function, run by `pnpm run test:stories`. The [testing documentation](../docs/06-testing/README.md) says how to choose between the kinds of test, and [integration tests](../docs/06-testing/integration-tests.md) explains how each suite runs.

Every command on this page runs from `app/`. Install Chromium once with `pnpm exec playwright install chromium`, and run `pnpm run generate` on a fresh clone: the mock models validate their data against the generated API client.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm run test:e2e:app` | Runs the application suite. Playwright starts the dev server itself on port 3100, which must be free. |
| `pnpm run test:e2e:stack` | Builds an isolated Compose stack, runs the five authenticated smokes and the four about billing, and removes its data. Needs Docker. |
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
│   │   ├── language.ts       # `startInLanguage`: makes every page the test loads start in a language, for a spec that goes on to navigate; `persistLanguage`: stores it for a page already loaded, to reload and assert
│   │   ├── assertions/       # shared expectations: toasts, accessibility, a dialog's focus trap, a page with no sideways scroll, a table that fits its container, a control that stays inside its card, tracked events, `recordWrites`, the writes a page sent (given `['GET']`, the reads, with their query), and `delayRequests`, which holds the requests that match back for a while so that a spec can look at the screen before the API has answered, and `readConsoleStorage`, which reads what the console keeps in the storage of the browser without the state of the mocked API that the suite keeps there
│   │   ├── session-scopes.ts # `signInWithScopes`: signs the page in as a session whose token carries given scopes, to check what a person who may not write sees
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
- **Billing**: `billing/` holds the scenarios of the billing capabilities (`BillingAppModel`) that every billing screen gates on, the invoices the specs read (`invoice-fixtures.ts`, `billing.scenarios.ts`), and the specs of the navigation, of what a billing link explains where billing is not there, and of the invoices of the organization: the list with its filters and export, one invoice and its actions, the usage behind a line, the handoff queue and the refusals of the API. The model of the invoices (`BillingInvoices`, behind `src/e2e/msw/billing-invoice-handlers.ts`) filters, pages, changes state and refuses as the API does, with its codes, and a spec arms a refusal on it with `armProblem`. The billing of an instance reads on the world of `billed-instances.ts` (the subscriptions, the upcoming invoice that would be held, the invoices, the journal of usage and where the retention begins; its clock is frozen so that periods are the same whatever day a spec runs) through `BillingSubscriptions`, which refuses a subscribe in the order and with the codes of the API, and the settings and the export of the data of the organization have their specs here too (`billing.settings.spec.ts`, `billing.data-export.spec.ts`). The screens of an instance, a customer and an entitlement that bill are specs of their own packs (`instances.billing`, `instances.subscribe`, `instances.usage-history`, `instances.freeze`, `customers.billing` and the three `delete-refusal`), on the slots of the billing and of the object together. The life of a subscription (cancelling it, moving it to another plan, changing its payment terms, taking a cancellation back, a trial at the start) is read on a world of its own, `lifecycle-world.ts`, with one instance for each state a subscription can be in, a license with versions on sale, a draft, a retired price and a price in another currency, and a family listed in the public catalogue; it keeps to the clock of `BILLED_NOW` and answers through `SubscriptionLifecycle` (`billing-lifecycle.ts`, behind `BillingSubscriptions`), which refuses as the API does, with its codes, a period that ended and is being closed included (`BoundaryPending`, which a spec arms with `retryAfterSeconds: 1` so that the retry of the console is seen without a wait of a minute, or with `retryAfterSeconds: 60` and `times: 2` on the fake clock of the page, `page.clock.install` and `runFor`, to see the refusal that follows a second try). Its specs are in `instances/` (`instances.cancel`, `instances.plan-change`, `instances.terms`, `instances.lifecycle-states`, `instances.subscribe-trial`, driven by `InstanceLifecycleDriver`) and `licenses/` (`licenses.public-listing`, `prices.deprecate-plan-change`), with its accessibility, narrow phone and French specs next to those of the other billing screens, and `billing/billing.notification-links.spec.ts` follows the notifications of billing to the screens they link to. The screens of a license version's prices live in `licenses/`, with the model of what a version sells (`LicenseAppModel`: grants, prices, the invoice preview composed as the API does it, and the freezes of a billed version). The add-ons have a pack of their own, `addons/`, on a world of its own (`addons.scenarios.ts`, installed on its three slots by `install-addons-world.ts`): a catalogue of add-ons in each state, the license families they fit, and the instances that hold them, one for each state of a subscription. The catalogue (`AddonCatalogue`, behind `src/e2e/msw/billing-addon-handlers.ts`) and what an instance holds (`InstanceAddons`) refuse as the API does, with its codes, a version that a live subscription holds included (`*.BillingActive`); the capability profile of the add-ons is `stackWithAddons`, the profile of `dev:mock`, where `stack` leaves them off for the many specs that do not ask for them. The specs of the pack are the catalogue (`addons.read`, `addons.lifecycle`, `addons.entitlements`, `addons.prices`, `addons.compatibility`), who may see and change it (`addons.access`) and its French reading (`addons.french`); what an instance holds is `instances/instances.addons.spec.ts`. The vouchers have a pack of their own, `vouchers/`, on a world of their own (`vouchers.scenarios.ts`, installed on its three slots by `install-vouchers-world.ts`, and built on the world of the add-ons): vouchers in each state (a discount being redeemed, a boost an instance holds, a draft, an archived one, one whose window closed, and one for each reason a code cannot be redeemed), what instances redeemed of them, and, in `vouchers.invoices.scenarios.ts`, invoices that discounts were composed on. The model (`BillingVouchers`, behind `src/e2e/msw/billing-voucher-handlers.ts`, with `billing-discounts.ts` composing the DISCOUNT lines of an invoice) checks, redeems, revokes and refuses as the API does, with its codes: a state derived from the window and the count, a boost that reads as expired past its window, an update of a published voucher that must restate what it keeps, and a subscribe that wraps the refusal of a code as `SubscribeInstance.VoucherInvalid`; the capability profile is `stackWithVouchers`. The specs of the pack are the list (`vouchers.read`), the wizard (`vouchers.create`), the page of a voucher (`vouchers.detail`), the invoices (`vouchers.invoices`), who may see and do what (`vouchers.access`) and the French reading (`vouchers.french`); what an instance redeemed is `instances/instances.vouchers.spec.ts`, and the accessibility and narrow phone specs are next to those of the other billing screens. Stripe, the payment provider, has no pack of its own: its screens are specs of the packs of the screens they are on, read on worlds that add its side to the ones above. `billing/stripe-fixtures.ts` holds the invoices Stripe collects in every state a console shows about one (open, charged to the card, a push that failed, a draft Stripe holds for review, amounts that differ, paid in Stripe since Kaiten last read it, a charge that needs the customer, queued), and the customers as Stripe holds them; `createStripeBillingModel` serves them on the capabilities the API answers now (`stackWithStripe`, which ships `stripe`, `chargeAutomatically` and `publicSurface` as the API answers them, `true`), with where Stripe stands as an option (`connected`, `connectedLive`, `available`, `notEntitled`, `vaultMissing`) and how its last pass went. `createStripeConnectorModels` pairs it with the connector (`connectors/connectors.scenarios.ts`), `createLifecycleStripeModels` is the lifecycle world on a deployment that offers Stripe, with a contract that can change provider and the invoices it has open, and `createStripeCustomersModels` is the customers with a card on file. The models behind them are `BillingProviders` (the provider's customers, payment methods, hosted pages, the health of billing and the pass that mirrors it) and `ConnectorAppModel` for Stripe's connector, which refuse as the API does, with its codes; a push is queued and its job runs when the invoice is read a second time, so a spec watches a page poll on the fake clock of the page, and leaves one queued for good (`stalledPushes`) or failing again (`pushFailures`) to see the rest. The specs are `connectors/connectors.stripe` (driven by `StripeConnectorDriver`), `billing/billing.health` (where Stripe stands in the settings, the health and the sync), `billing/billing.invoice-provider` and `billing/billing.invoice-provider-actions` (an invoice Stripe collects, and a push, a read back, a finalization and a void), `billing/billing.capabilities` (the tile, the navigation and the settings follow the providers the API lists, never the flags of `features`, which a spec makes lie to show it), `instances/instances.provider` (the provider and the collection method of a contract, and the invoices still open) and `customers/customers.payment-method` (`CustomerPaymentMethodDriver`), with `accessibility/accessibility.stripe`, `mobile/mobile.stripe` and `billing/billing.french-stripe` next to those of the other billing screens, and `e2e/bootstrap/dev-mock.spec.ts` checking that `dev:mock` answers every request of them. The publishable keys a web page reads the public catalogue with have their specs in `integrations/` (`integrations.publishable-keys`, `.access` and `.french`, driven by `PublishableKeysDriver`, on the world of `integrations.scenarios.ts`: billing on with the capabilities the API serves now, where `publicSurface` is shipped and enabled, and four keys, one revoked), with `accessibility/accessibility.publishable-keys` and `mobile/mobile.publishable-keys` next to those of the other billing screens. The keys are `BillingPublishableKeys` (`billing-publishable-keys.ts`, behind `src/e2e/msw/billing-publishable-key-handlers.ts`), which refuses as the API does, with its codes, and never keeps a key but its last four characters: a spec asserts that the key issued is in no address and no storage of the browser (`readConsoleStorage`). How the limit of an entitlement of an instance is composed (the `provenance` and the `source` its usage carries, as the API sends them) has its spec in `instances/instances.entitlements-provenance.spec.ts`, driven by `InstanceEntitlementsDriver`, on the world of `createProvenanceInstancesModel`; the model of the instances composes the same provenance when an add-on or a boost changes a limit (`effective-entitlement.ts`).
- **A workspace**: `release-management/` covers releases, components and deployment zones together, because they form one workspace with shared state.
- **Read-only and cross-cutting checks**: `audit-trail/`, `dashboard/`, `notifications/`, `accessibility/` (axe, the focus trap of dialogs), `i18n/` and `mobile/` (a Pixel 5 viewport, and the 375 px width billing screens are checked at).

## Write an application spec

The rules the packs follow:

1. A simple object gets its own folder. A sub-domain that spans several features gets one workspace folder, as `release-management/` does.
2. Specs are named `<subject>.<intent>.spec.ts`. The subject is the pack or, in a workspace folder, the object the spec covers (`releases.create.spec.ts` in `release-management/`). The intent is what the user does or what the spec checks: `read`, `create`, `update`, `delete`, `errors`, `deploy`, `toggle`, `lifecycle`, `display-order` and so on. One spec file states one intention; a significant variant goes in its own file, not in a long test. `accessibility/` holds `accessibility.spec.ts`, the axe smoke over the main screens, and one spec for an area whose dialogs need more than that (`accessibility.licenses.spec.ts`: no violation, the focus held, Escape to close); `mobile/` does the same (`mobile.licenses.spec.ts`).
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

Most models keep the pending errors in an `ErrorInjector` (`e2e/app/_support/model/error-injector.ts`), which fails a call with a status. A refusal that the screen reads, with its code and its `detail`, is armed with `setNextProblem` on the license model (`model.setNextProblem('createPrice', { code, detail, status })`) and with `armProblem` on the models of the invoices, of the subscriptions and the billing defaults (`model.subscriptions.armProblem('subscribeInstance', { code, detail, status })`), of the catalogue of add-ons (`model.addons.armProblem('deleteAddon', ...)`) and of what an instance holds of them (`model.subscriptions.armProblem('setInstanceAddonQuantity', ...)`), of the vouchers and what instances redeemed of them (`model.vouchers.armProblem('redeemVoucher', ...)`), of the usage history (`instances.usageHistory.armProblem('listUsageReports', ...)`) and of the customers (`customers.armProblem('update', ...)`); `after` lets that many calls through first, to stop a sequence of calls halfway, `times` makes the refusal last that many calls in a row (one when it is left out), and `retryAfterSeconds` gives the refusal the `Retry-After` header of a period being closed.

What a screen sends is as much part of the behaviour as what it shows (an amount typed as `49.00` goes out as `4900`): `recordWrites(page, /^\/api\/licenses\/[^/]+\/prices$/)` from `app-test` returns the writes a page sends, with their JSON bodies, to assert once the call has answered. The mocks answer at once, which hides what happens in between (a row that left a list before its delete was refused, a button pressed twice): `delayRequests(page, { methods: ['DELETE'], ms: 1_000, pathname: /\/api\/entitlements\/[^/]+$/ })`, installed before `goto`, holds the matching calls back.

A page keeps the first model it is given for a slot: installing a second one for the same slot is ignored. A spec that arms a model (`armProblem` on the billing subscriptions, the invoices, the usage history or the customers) therefore installs it itself, and not in a shared `beforeEach` that already installed an unarmed one.

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
  `shell-handlers.ts` declares empty sidebar preloads, notifications and the
  billing capabilities (billing off, which the side navigation reads on every
  page) only after those owners. A spec that needs billing on installs the
  `billing` slot (`installBillingAppMocks`, with a scenario of
  `billing/billing.scenarios.ts`). An undeclared `/api` call ends in a network error naming
  its method, URL and GraphQL operation; `app-test.ts` fails the test on it.
- **Dev world:** `dev:mock` installs its shared model seeds, warns on an
  undeclared API call, and passes it through. Its inventory and cross-record
  consistency run under Vitest because its domain imports need Vite's env.
- **Partial notifications on a real stack:** only notifications are mocked;
  business API, platform flags and webhooks pass through.

Integration read-only stubs use the `integrationStubs` slot in strict MSW.
Without a webhooks stub the webhooks routes answer 404, as on a self-hosted
deployment, so the console hides them; `installEmptyWebhooksStub` serves them
empty, as Kaiten Cloud does, and `installWebhooksNotEntitledStub` refuses them,
as Kaiten Cloud does for an organization whose licence lacks them.
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

`billing-console.stack.spec.ts` is about the invoices. What
only a real closing can prove is that an invoice is billed to whom the customer
was when it was composed, so the spec has the API compose them: a customer on a
published monthly license, subscribed a period back, renamed between the two
boundaries. Nothing in the console starts a closing, so the spec asks for one
with `POST /billing/close-periods`, as the period-close job does on its own pass,
and polls until the period is due. It then checks the console against what the
API composed (the activation under the first name, the renewal under the second,
ready to bill and waiting in the handoff queue), marks the renewal paid with the
number of the accounting system, and finds it acknowledged in the queue under
that number. It skips itself on the 29th, 30th and 31st, when a month ago is not
a day. The stack runs the API with `docker/config/api.yaml`, which turns billing
on.

`billing-subscribe.stack.spec.ts` is about what a person does with billing from
the console, where the rules are the server's. A customer with no billing e-mail
and an instance on a published monthly license are set up through the API. The
console subscribes the instance with a start ten days back, sets the e-mail of
the customer from the dialog and the payment terms of the contract, and the spec
reads both back from the API; it then tries to delete the instance, which the API
refuses while it bills, and checks what the console says. A second test saves the
defaults of the organization, reads them back and puts them back, after the field
has refused 366 days in words and sent nothing (the API holds 0 to 365). A third
reports usage through the API and reads it in the usage history of the
entitlement: the counter from report to report, the export, and the notice that
offers the first day the API keeps when a period begins before its retention.
`billing-lifecycle.stack.spec.ts` is about the end of a subscription, where the
server decides what an invoice says. A customer, an instance on a published
monthly license and its subscription are set up through the API, and the customer
is renamed while the subscription bills. The console cancels it at once (the
immediate mode, with a reason), the spec reads the cancellation back from the API,
and follows the dialog to the final invoice: it is billed to the new name, while
the activation invoice, issued before the rename, keeps the old one. The tab
then reads as an ended subscription, with the two invoices.
`stack-api.ts` holds what the specs of billing share: the address of the API, the
credentials of the first dev user, the sign-in of the console and the write of a
setup that has to be accepted, and `stack-billable.ts` the setup of a customer
and of an instance on a published license that sells a flat fee.

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
