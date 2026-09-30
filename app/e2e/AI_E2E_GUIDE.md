# Writing E2E specs with an AI assistant

Give this page to an AI assistant that has to write, complete or prepare Playwright specs for the console in `app/`. It says what the assistant reads, what it settles before it writes, and holds prompts to copy.

It does not repeat two pages the assistant reads anyway:

- [`app/e2e/README.md`](./README.md): the layout of `e2e/`, the naming and writing rules, how to add a mock area, codegen.
- [Integration tests](../docs/06-testing/integration-tests.md): how each suite runs and how the network mocks work.

Every command on this page runs from `app/`, and a path that starts with `e2e/`, `src/`, `scripts/` or `.storybook/` is relative to that folder. The prompts give paths from the repository root.

## Choose the kind of test

[Which test to write](../docs/06-testing/README.md#which-test-to-write) has the full list. For a spec an assistant writes, the cut is:

| The behaviour | Write | Where |
| --- | --- | --- |
| Depends on a route, on a mutation that shows on several screens, on the query cache, or on a form or a dialog that submits to the API | An application spec | `e2e/app/<pack>/` |
| Is local to a component that needs no form, query or API data: a table, a list, a stateless widget | A story with a `play` function | `src/**/stories/*.stories.tsx`, run by `pnpm run test:stories` |
| Is purely visual | A visual regression test | `e2e/tests/visual-regression.spec.ts` |

- `e2e/app/` holds application specs only. `e2e/tests/` holds the visual regression spec only. A component interaction is a story, not a Playwright spec.
- A story listed in `storybookTestExclude` in `app/vite.config.ts` stays in Storybook, but `pnpm run test:stories` never runs it, so its `play` function runs only when someone opens the story. The stories of the dialogs and forms that are coupled to forms, queries or the API are in that list. Cover that behaviour with an application spec.
- A sub-domain that spans several features gets one workspace pack, not one pack per feature. See [Write the specs for a workspace](#write-the-specs-for-a-workspace).

## Read first

Before it writes a spec, the assistant reads:

1. [`app/docs/AI_CONTEXT.md`](../docs/AI_CONTEXT.md).
2. [`app/e2e/README.md`](./README.md), in particular [Write an application spec](./README.md#write-an-application-spec).
3. [Integration tests](../docs/06-testing/integration-tests.md).
4. The routes the flow crosses, in `app/src/routes`.
5. The feature it exercises, in `app/src/features/<name>` (start with its `README.md`), and the domain or functional that feature uses.
6. An existing pack of the same shape, in `e2e/app/`.

## Write the specs for an object

Use this section for an object that has its own screens: `customers`, `instances`, `entitlements`, `feature-flags`, `licenses`.

### Check what the UI offers

Do not assume that every object has a symmetric create, read, update, delete. Read the routes and the screens, and settle:

- whether there is a list, a create route and a detail page;
- how an update is exposed: a dialog route such as `/releases/deployment-zones/$zoneSlug/edit`, a `?mode=configure` search parameter on the detail route (customers, instances, entitlements and feature flags have one), or a page of its own;
- whether the UI deletes the object at all. Customers, entitlements and instances have a delete spec. The console cannot delete a feature flag, so `e2e/app/feature-flags/` has none;
- whether the object has a flow richer than CRUD: Try it on a feature flag, deploying or migrating an instance, the lifecycle of a license or a connector.

If a verb is not in the UI, the pack does not test it.

### Method

1. Read the routes and the feature of the object.
2. Create or complete `e2e/app/<pack>/`. Name the specs `<subject>.<intent>.spec.ts`, as [the README](./README.md#write-an-application-spec) says, and keep only the intentions the UI really offers.
3. When a flow creates, updates or deletes, use the pack's model and its installer (`e2e/app/_support/mocks/install-<area>-app-mocks.ts`, named after the singular area: `install-customer-app-mocks.ts` for the `customers` pack). An area with no mocks yet follows [Mock a new area](./README.md#mock-a-new-area).
4. Put the data in `<pack>.scenarios.ts`, with readable business names (`Acme Corp`, `Beta Access`, `Production EU`), not `test-1` or `foo`. Add each new factory to `scripts/check-e2e-contracts.ts`.
5. After a mutation, assert what the other screens show: a created entity in the list, an updated value on the detail page, a deleted entity gone or no longer interactive. When the app is meant to re-read its data without a reload, do not reload in the spec.
6. Look in `e2e/app/_support/` before you write a helper. A new driver, model or installer goes there too, one per area.
7. Update the documentation only when a convention shared by several packs changes.

### Prompt

```txt
Write the Playwright application specs for `<pack>`, following
`app/e2e/AI_E2E_GUIDE.md` (section "Write the specs for an object") and
`app/e2e/README.md`.

Paths start at the repository root. Run every command from `app/`.

Constraints:
- write the specs in `app/e2e/app/<pack>/`
- read the routes of the object in `app/src/routes` and its feature in
  `app/src/features/<name>` first; do not assume a symmetric CRUD, and do not
  test a verb the UI does not offer
- reuse the drivers, models and mock installers in `app/e2e/app/_support/`
  before you create a helper
- keep the mocks stateful for every create, update or delete
- locate elements by role, label, visible text or URL
- put the test data in `<pack>.scenarios.ts` and add new factories to
  `app/scripts/check-e2e-contracts.ts`
- one intention per test
- from `app/`, run `pnpm run lint`, `pnpm run typecheck:e2e`,
  `pnpm run check:e2e-contracts` and
  `pnpm exec playwright test -c playwright.app.config.ts e2e/app/<pack>`

Final answer: a short summary, the flows covered, the main files touched, the
commands you ran with their result, and the assumptions you made.
```

## Write the specs for a workspace

A workspace pack fits a sub-domain that spans several features, where a flow moves between their screens and a change made on one screen has to show on the others. `e2e/app/release-management/` is the reference. Releases, components and deployment zones share one model, `ReleaseManagementAppModel` (`e2e/app/_support/model/release-management-app-model.ts`), instead of three object models. That model is the only source of truth for:

- the REST routes of releases, components and deployment zones;
- the `GetReleaseManagementOverview` GraphQL query, which lists each release with its components, every deployment zone it was ever deployed to and the instances in them;
- the relations between a release, its deployment zones and their instances;
- the deployment log: a zone only holds the release it runs now, so the model keeps what each zone ran before (`deployments` in the seed, which defaults to each zone's current release, and one more entry for every deployment a spec makes). It is what makes a release read Superseded once every zone has moved on.

Keep the specs in one folder and do not compose several object models when one shared model is clearer. The pack holds:

- `release-management.scenarios.ts`, with the seeded models of its flows;
- `workspace.read.spec.ts`: navigation across `/releases`, `/releases/deployments`, `/releases/components` and `/releases/deployment-zones`, and the detail pages of a release and of a zone;
- `releases.create.spec.ts`, `components.create.spec.ts`, `deployment-zones.update.spec.ts` and `deployment-zones.deploy.spec.ts`: the flows driven by a route, each ending on what the other screens now show;
- `release-status.read.spec.ts`: a release replaced on every zone reads Superseded on both lists, the releases dialog of the catalog, the releases dialog of a zone and its own page, from a seeded log and after deployments replace it, the same statuses in French, and a deleted release leaving the deployments list and its cards;
- `release-management.errors.spec.ts`: a server error on a release create.

Its installer is `e2e/app/_support/mocks/install-release-management-app-mocks.ts`, and its drivers are `release-detail`, `release-form`, `release-list`, `releases-dialog`, `release-management-tabs`, `deployment-zone-detail` and `deployment-zone-dialog` in `e2e/app/_support/drivers/`.

The stories for `ReleaseForm`, `ReleaseTable`, `DeploymentZoneTable`, `DeployReleaseDialog` and `DeploymentZoneFormDialog` are in `storybookTestExclude`. The pack checks the same surfaces in the real screens: navigation, creating a release, creating a component, editing a zone and deploying a release to a zone. A story cannot prove that a mutation refreshes another screen, so do not ask Storybook to.

The assistant reads, in this order: `app/src/routes/releases/**`, `app/src/domains/release-management/**`, `app/src/functionals/release-management/**`, then `app/src/features/releases/**`, `app/src/features/components/**` and `app/src/features/deployment-zones/**`.

### Prompt

```txt
Write or complete the application specs of the `<workspace>` workspace,
following `app/e2e/AI_E2E_GUIDE.md` (section "Write the specs for a workspace")
and `app/e2e/README.md`. `app/e2e/app/release-management/` is the reference.

Paths start at the repository root. Run every command from `app/`.

Constraints:
- read the routes, the domain, the functionals and the features of the
  workspace first
- write the specs in `app/e2e/app/<workspace>/`, in one folder
- reuse the shared stateful model and installer in `app/e2e/app/_support/`, or
  add one model for the whole workspace
- do not turn the workspace into one fake CRUD per feature
- prefer flows a user can see, and what each screen shows after a mutation
- from `app/`, run `pnpm run lint`, `pnpm run typecheck:e2e`,
  `pnpm run check:e2e-contracts` and
  `pnpm exec playwright test -c playwright.app.config.ts e2e/app/<workspace>`
```

## Write or extend a story

A story with a `play` function covers what is local to a component that needs no form, query or API data: a table, a list, a stateless widget. A dialog or a form coupled to a mutation or a query belongs to an application spec, because its story is in `storybookTestExclude`. [Integration tests](../docs/06-testing/integration-tests.md#storybook-tests) explains how the runner works and what each story receives. For an assistant:

1. Point to one explicit, stable story, by its file and its export.
2. A story whose `play` function changes what is on screen must be interactive, or keep its state in a wrapper.
3. `.storybook/preview.tsx` provides the query client, i18n, the theme and the tooltip provider. A router comes from `StorybookRouter` (`src/test-fixtures/storybook-router.tsx`). Any other context comes from the story or a local decorator.
4. Assert what the user sees after the interaction, not only that a callback ran.
5. Check that the story is not in `storybookTestExclude`. If it is, `pnpm run test:stories` does not run it.

Stories whose `play` function the runner executes:

- `src/features/feature-flags/targeting/components/stories/targeting-list.stories.tsx`
- `src/features/customers/components/stories/customer-table.stories.tsx`
- `src/domains/audit-trail/components/stories/audit-trail-content.stories.tsx`
- `src/functionals/table/stories/data-table.stories.tsx`

For a screenshot test, follow [Visual regression](./README.md#visual-regression).

## Run the checks

```bash
pnpm run lint
pnpm run typecheck:e2e
pnpm run check:e2e-contracts
pnpm exec playwright test -c playwright.app.config.ts e2e/app/<pack>
```

Add `pnpm run test:stories` when a story changed. Port 3100 must be free for the application suite. If a check cannot run, the assistant says so.

## Turn a manual pass into a spec

Capture a real flow by hand first, then hand the capture to the assistant. To record the clicks themselves, see [Codegen](./README.md#codegen): what it writes is notes, not a spec.

### What to capture

Capture a business flow, not a list of clicks:

- who acts, what they are allowed to do, and why;
- the start: the page, the signed-in state and the data that already exists;
- the data they use: names, slugs, dates, search terms;
- the actions, and the result each one must show;
- the visible proof that it worked: the URL, a heading, a toast, a new row, a button that becomes enabled or disabled, a badge, a status, a counter, an error message;
- what is unclear: ambiguous wording, odd behaviour, an unexpected wait, an element that is hard to target, a dependency that is not deterministic.

One flow answers one question: create a customer, search for an existing customer, create a feature flag, add a targeting rule, deploy a release to a deployment zone, check that the dashboard shows a coherent state. Split a flow when it passes about 10 to 15 meaningful steps, serves several intentions or starts from several states, when the happy path and the failures are better apart, or when part of it is already covered.

Capture in this order: read the main list, create, update and find a record with a search or a filter; then delete, form validation and server errors; then empty states, advanced configuration and edge cases. Capture the negative cases too: a required field left empty, an API error, no data, a search without result, an action that is not allowed.

A session note is raw, and the assistant needs the normalised statement:

| Session note | Statement for the spec |
| --- | --- |
| "I searched Beta and Acme went away" | When the user types `Beta` in the search box, the `Acme Corp` row is no longer visible. |
| "Next stays grey until I type a version" | The Next button stays disabled until a version is entered. |
| "After creating I land on the release" | After a successful creation, the user lands on the page of the new release. |

Prefer assertions that carry user value: the right screen, the created resource in the list, a useful error message, a button enabled or disabled by a business rule, a section that becomes visible. Avoid the exact position of an element, cosmetic details, complex CSS selectors, implicit timing and element counts that depend on the size of the seed.

### Template

Copy this into the session notes.

```txt
Workflow: <short title>
Who acts: <role, and what they may do>
Goal: <what they want, and what they expect to see>
Why it matters: <what goes wrong for a user if it fails>

Start: <URL>, <signed in or not>, <data that already exists>
Data: <entities and values: names, slugs, dates, search terms>

Steps, one row per observable action:
| # | Where | Action | Data | Expected, visible | Observed |
|---|-------|--------|------|-------------------|----------|
| 1 |       |        |      |                   |          |

Final state: <URL, heading, toast, row, badge, and what must no longer be visible>
Variants and failures: <empty state, required field empty, server error, search without result>
Friction: <unclear wording, timing, hard-to-target elements, non-deterministic behaviour>

Kind of test: application spec | story | visual regression
Target file: <path>
Reuse: <drivers, models, scenarios>
Do not test: <what is covered elsewhere>
```

### Prompt

```txt
Write a Playwright spec from the workflow below.

Context:
- the console is in `app/`; paths start at the repository root
- follow `app/e2e/AI_E2E_GUIDE.md` and `app/e2e/README.md`
- reuse the drivers, models, installers and scenarios in
  `app/e2e/app/_support/` and in the pack when they fit
- locate elements by role, label, visible text or URL, and avoid fragile
  selectors
- when a behaviour is ambiguous, choose the option that is the most robust in CI

Workflow:
<paste the filled template>
```

## What the assistant reports

When it finishes, the assistant gives:

- a short summary of what it added;
- the flows covered;
- the main files it touched;
- the commands it ran and their result;
- the assumptions and limits that remain.
