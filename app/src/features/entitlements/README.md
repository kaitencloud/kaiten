# Entitlements

An entitlement is something a license can grant: a capability, a numeric allowance or a configuration value. Users list, create, edit and delete entitlements, sort them into groups, and open a detail page that shows which licenses grant an entitlement and how much of the allowance the instances use.

## Routes

| URL | Route file | Renders |
| --- | --- | --- |
| `/entitlements` | `app/src/routes/entitlements/index.tsx` | `EntitlementsPageContent`: the table |
| `/entitlements/new` | `app/src/routes/entitlements/new/index.tsx` | `EntitlementCreatePage` |
| `/entitlements/$entitlementSlug` | `app/src/routes/entitlements/$entitlementSlug/index.tsx` | `EntitlementDetailOverviewTab` |
| `/entitlements/$entitlementSlug/usage` | `app/src/routes/entitlements/$entitlementSlug/usage.tsx` | `EntitlementDetailUsageTab` |
| `/entitlements/$entitlementSlug/customers` and `/licenses` | `customers.tsx`, `licenses.tsx` in the same folder | Redirect to `.../usage` |

`app/src/routes/entitlements/route.tsx` is the layout of the whole section. It loads the entitlements and the groups, and wraps the outlet in a Suspense boundary. `app/src/routes/entitlements/$entitlementSlug/route.tsx` loads one entitlement, sets its name as the breadcrumb title and renders `EntitlementDetailPageContent`, which draws the header, the stats strip and the two tabs (Overview and Usage) around the child route. It also opens `EntitlementFormDialog` when the URL carries `?mode=configure`; the Edit button of the Overview tab navigates there.

## Structure

```txt
app/src/features/entitlements/
├── index.ts
├── queries/                  # entitlements and groups query options
├── hooks/                    # mutation hooks, useEntitlementLicenseLinks
└── components/
    ├── entitlements-page-content.tsx    # page header and table
    ├── entitlement-table*.tsx           # table, columns, row actions
    ├── use-entitlement-table-filters.ts # filter facets of the table
    ├── entitlement-create-page.tsx      # creation, as a page with two steps
    ├── entitlement-form-dialog.tsx      # edition, as a dialog around entitlement-form.tsx
    ├── entitlement-form*.ts(x)          # form, its fields, its zod schema and payload helpers
    ├── use-entitlement-mutation-form.ts # form state and submit for create and update
    ├── entitlement-unit-fields.tsx      # unit labels and sale unit
    ├── entitlement-reset-period*.ts(x)  # usage window: fields and payload rules
    ├── entitlement-group*.tsx           # group selector, badges, inline editor cell
    ├── use-entitlement-group-selector-state.ts
    ├── *-display.tsx                    # type, aggregation method, reset period labels
    ├── entitlement-detail/              # detail page: layout, cards, tabs, data hook
    ├── stories/
    └── __tests__/
```

In this page, a file inside the feature is written relative to `app/src/features/entitlements/`. Any other path starts at the repository root.

Shared pieces come from elsewhere: `Page`, `DetailCard`, `DetailEntityLayout`, `StatsCardsRow` and `TableCard` from `@/functionals/*`, the table and filters from `@/functionals/table` and `@/functionals/filters`, and the usage meter, status and ceiling rules from the `entitlement-usage` domain (`app/src/domains/entitlement-usage/`).

## Data

The lists of entitlements and groups come from helpers of `app/src/lib/api/all-pages-query-options.ts` that fetch every page of a generated `list*` operation. The generated operations and query keys are used as they are.

| What | Operation | Where |
| --- | --- | --- |
| Entitlements | `listEntitlements` (all pages), `getEntitlement` | `queries/entitlements-query-options.ts`: `entitlementsQueryOptions`, `entitlementQueryOptions(slug)` |
| Groups | `listEntitlementGroups` (all pages) | `queries/entitlement-groups-query-options.ts`: `entitlementGroupsQueryOptions` |
| Create, update | `createEntitlement`, `updateEntitlement` (a PUT that replaces the whole entitlement) | `useEntitlementFormMutations` |
| Delete | `deleteEntitlement` | `EntitlementTableActions`, with `optimisticDeleteCallbacks` on `listEntitlementsQueryKey()` |
| Create a group | `createEntitlementGroup` | `useEntitlementGroupFormMutations`, called by the group selector |
| Usage of the detail page | `getEntitlementsUsageMetrics` (`GET /instances/{instanceSlug}/entitlements/usage`), one call per instance whose license grants the entitlement | `components/entitlement-detail/use-entitlement-detail-data.ts` |

The detail page also reads all the licenses, instances and customers, and the entitlements of each license (`allLicensesOptions`, `allInstancesOptions`, `allCustomersOptions`, `allLicenseEntitlementsOptions`). It derives everything it shows from them in the browser: the linked licenses, the impacted instances and customers, the usage rows, the saturation buckets and the rankings. The logic is in `components/entitlement-detail/entitlement-detail-context-*.ts`, which the unit tests cover.

Invalidation:

- Creating an entitlement inserts it at the head of the cached list, then invalidates the list.
- Updating one invalidates the list, that entitlement, and the license entitlement queries (`getLicenseEntitlements`).
- Creating a group inserts it in the cached groups list, then invalidates it.

`entitlementToUpdateBody` (`components/entitlement-form.shared.ts`) rebuilds a complete `EntitlementWritable` from a stored entitlement. Every partial edit uses it (rename in the detail header, icon dialog, inline groups), because the PUT replaces the whole entitlement and would otherwise wipe the other fields.

Scopes: listing and reading entitlements and groups needs `read:entitlements`; creating, updating or deleting an entitlement, and creating a group, needs `write:entitlements`. The other reads have their own scopes. The delete check reads licenses and their entitlements (`read:licenses`). The detail page reads licenses and their entitlements (`read:licenses`), instances (`read:instances`), customers (`read:customers`) and the usage metrics (`read:instances`). The screens do not check scopes themselves.

## Behaviour

**List.** The table has the columns Name (with the icon, sortable), Description, Groups, Type, Aggregation Method and a delete action. A row opens the entitlement. The search box filters on the name (200 ms debounce), and the filter bar offers Name, Description, Type, Groups and Aggregation. The options of the Type, Groups and Aggregation facets come from the rows themselves, so a facet only offers values that exist. The Groups cell edits inline: clicking it opens the group selector, and each change is saved at once with `updateEntitlement`. The cell puts the previous groups back and shows an error toast when the save fails.

**Groups.** A group has no page of its own. The group selector, in the form and in the list cell, searches the existing groups. When the search matches none, it offers to create a group with the typed name and selects it. Groups are only created and assigned from there: the console has no screen to rename or delete a group.

**Delete.** The delete dialog asks which licenses grant the entitlement, by reading all the licenses and their entitlements, and only when it opens. While it checks, and when at least one license grants the entitlement, the confirm button is disabled and the dialog says to remove the entitlement from those licenses first. The removal is optimistic: the row disappears, and comes back if the API refuses.

**Create.** `/entitlements/new` is a page with a stepper of two steps. Step 1 holds the name (required), the icon, the description, the groups, the "User facing" switch and the display order. Next stays disabled until step 1 validates. Step 2 holds the type and the options that depend on it. After a successful creation, the route opens the new entitlement's detail page.

**Edit.** `EntitlementFormDialog` holds the same fields in a dialog. It has two steps for a NUMBER entitlement and one for any other type, which has nothing to configure on the second step.

**Form rules** (`entitlementFormSchema`, built from the generated `zEntitlementWritable`):

- The type is Boolean, Number or Config. It is required and cannot change after creation. The API also defines an AI credit type, which the list and the detail page display but the form does not offer.
- Only a NUMBER entitlement has an aggregation method (Count, Sum, Average, Min, Max or Latest; Sum by default), which cannot change after creation, a usage reset and units. For a Boolean or Config entitlement, the form drops these fields from the payload.
- Usage reset: a lifetime counter (the default) or a cadence of hour, day, week, month or year, with a window anchored on the calendar or on the license start date. Once an entitlement stores a cadence, it can never change or be removed: the fields become read-only, and the payload repeats the stored pair, because the PUT replaces the whole entitlement. The Latest aggregation cannot have a cadence, so the fields give way to an explanation.
- Units: a pair of labels (singular and plural) for the base unit. A "sold in different units" switch adds a sale unit: singular and plural labels, and the number of base units in one sale unit (greater than zero). The base pair is all-or-none, and the sale unit (both labels and the factor) is all-or-none and needs the base pair. The schema flags a partial configuration as invalid, and the payload builders run `conditionUnitFields`, which drops a partial configuration instead of sending it to the API.
- The display order is a non-negative integer, 0 by default. A cleared field counts as 0.

**Detail page.**

- Header: the icon, which opens a dialog that saves as soon as an icon is picked or cleared; the name, editable in place; and the description.
- Stats strip: linked licenses, license alerts (licenses near their limit, from 80% to 100% saturation, and licenses over it), linked licenses with no limit, and the impact scope (instances, customers and instances at risk).
- Overview tab: the General card (type, aggregation method, usage reset, units, user facing, groups, description and audit fields), with the Edit button, and a card that lists the licenses granting the entitlement. That card puts the licenses over their limit first, then those near it, then the most used, shows five, and expands on demand. Each license links to its page and shows what it grants: a number, Unlimited, Enabled, Disabled or Configured.
- Usage tab: the saturation buckets (under 50%, 50 to 80%, 80 to 100%, over 100%, unbounded) and the top at-risk licenses, shown only once a linked license sets a limit; the at-risk instances, meaning near their limit, past the granted value inside a soft limit's tolerance, or over the limit, each with its own usage window; and the coverage by customer, which links to each customer.

### Empty and error states

The table shows the shared `DataTable` empty row ("No results") and keeps the create button. On the detail page, each card and table has its own loading and empty message. A failed create or update shows the API's error message in a toast.

## Tests

- Unit tests, run with `pnpm run test` from `app/`: `components/__tests__/` covers the form (`entitlement-form.test.tsx`, `entitlement-form-shared.test.ts`, `entitlement-reset-period-shared.test.ts`), the groups (`entitlement-group-selector.test.tsx`, `entitlement-group-badges.test.tsx`, `entitlement-groups-inline-editor-cell.test.tsx`) and the detail cards (`entitlement-detail-general-card.test.tsx`, `entitlement-detail-licenses-card.test.tsx`). `components/entitlement-detail/__tests__/` covers the aggregates and the summary of the detail data.
- Stories, in `components/stories/`, open in Storybook (`pnpm run storybook` from `app/`): `Features/Entitlements/EntitlementTable` (`Default`, `Empty`), `Features/Entitlements/EntitlementFormDialog` (`CreateNumberEntitlement`, `EditBooleanEntitlement`, `EditNumberEntitlementWithUnits`) and `Features/Entitlements/EntitlementDetailPageContent` (`Overview`). None has a `play` function. `pnpm run test:stories` renders the table stories only: `app/vite.config.ts` excludes the form dialog and detail stories, because the end-to-end pack covers them.
- End to end, run with `pnpm run test:e2e:app` from `app/`: the pack `app/e2e/app/entitlements/` has one spec per intention (`create`, `delete`, `display-order`, `errors`, `icon`, `read`, `reset-period`, `units`, `user-facing`) and its test data in `entitlements.scenarios.ts`. It runs on `app/e2e/app/_support/model/entitlement-app-model.ts` and the mocks in `app/e2e/app/_support/mocks/install-entitlement-app-mocks.ts`. The accessibility spec also visits the list.

## Public API

Routes import the following from `@/features/entitlements` (the root `index.ts`):

| Export | Imported by |
| --- | --- |
| `EntitlementsPageContent`, `entitlementsQueryOptions`, `entitlementGroupsQueryOptions` | `app/src/routes/entitlements/index.tsx`, `app/src/routes/entitlements/route.tsx` |
| `EntitlementCreatePage` | `app/src/routes/entitlements/new/index.tsx` |
| `EntitlementDetailPageContent`, `EntitlementFormDialog`, `entitlementQueryOptions`, `entitlementGroupsQueryOptions` | `app/src/routes/entitlements/$entitlementSlug/route.tsx` |
| `EntitlementDetailOverviewTab` | `app/src/routes/entitlements/$entitlementSlug/index.tsx` |
| `EntitlementDetailUsageTab` | `app/src/routes/entitlements/$entitlementSlug/usage.tsx` |

The licenses feature does not import this one; it declares its own `entitlementsQueryOptions` over the same generated operation.
