# Entitlements

An entitlement is something a license can grant: a capability, a numeric allowance or a configuration value. A numeric entitlement is either calculated, from the usage that is reported against it, or combined: the weighted sum of the usage of other numeric entitlements, its sources, computed when it is read and shown, never granted and never enforced. Users list, create, edit and delete entitlements, sort them into groups, and open a detail page that shows which licenses grant an entitlement and how much of the allowance the instances use.

## Routes

| URL                                                                   | Route file                                                       | Renders                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| `/catalog/entitlements`                                               | `app/src/routes/catalog/entitlements/index.tsx`                  | `EntitlementsPageContent`: the table |
| `/catalog/entitlements/new`                                           | `app/src/routes/catalog/entitlements/new/index.tsx`              | `EntitlementCreatePage`              |
| `/catalog/entitlements/$entitlementSlug`                              | `app/src/routes/catalog/entitlements/$entitlementSlug/index.tsx` | `EntitlementDetailOverviewTab`       |
| `/catalog/entitlements/$entitlementSlug/usage`                        | `app/src/routes/catalog/entitlements/$entitlementSlug/usage.tsx` | `EntitlementDetailUsageTab`          |
| `/catalog/entitlements/$entitlementSlug/customers` and `.../licenses` | `customers.tsx`, `licenses.tsx` in the same folder               | Redirect to `.../usage`              |

The entitlements are the second entry of the Catalog section of the side navigation (`catalogSubRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`), listed on every deployment.

`app/src/routes/catalog/entitlements/route.tsx` is the layout of every entitlement route. It loads the entitlements and the groups, and wraps the outlet in a Suspense boundary. `app/src/routes/catalog/entitlements/$entitlementSlug/route.tsx` loads one entitlement, sets its name as the breadcrumb title and renders `EntitlementDetailPageContent`, which draws the header, the stats strip and Overview and Usage plus Pricing for AI-credit definitions around the child route. It also opens `EntitlementFormDialog` when the URL carries `?mode=configure`; the Edit button of the Overview tab navigates there.

## Structure

```txt
app/src/features/entitlements/
├── index.ts
├── queries/                  # entitlements and groups query options
├── hooks/                    # mutation hooks, useEntitlementLicenseLinks
├── utils/entitlement-writable.ts # complete PUT, unit normalization and the sources body
└── components/
    ├── entitlements-page-content.tsx    # page header and table
    ├── form/                 # create page, configure dialog, fields (usage source, sources), local hook and schemas
    ├── table/                # table, columns, row actions and local filter hook
    ├── groups/               # selector, badges, inline editing and local state hook
    ├── display/              # type, usage source, aggregation method and reset period labels
    └── entitlement-detail/   # detail layout, cards, tabs and data hook
```

In this page, a file inside the feature is written relative to `app/src/features/entitlements/`. Any other path starts at the repository root.

Shared pieces come from elsewhere: `Page`, `DetailCard`, `DetailEntityLayout`, `StatCard` and `TableCard` from `@/functionals/*`, the table and filters from `@/functionals/table` and `@/functionals/filters`, and the usage meter, status and ceiling rules from the `entitlement-usage` domain (`app/src/domains/entitlement-usage/`). The rules of a combined entitlement that other features share, which entitlements can be a source of which, whether two share a window, the weighted sum of two grants, live in that domain too (`combined-entitlements.ts`), and the exact decimal arithmetic they use in `app/src/lib/decimal.ts`.

The detail composes `DetailEntityLayout.Top`, Body, Tabs and Content. It supplies
business labels/URLs while the functional owns fixed/scrolling regions.

## Data

The lists of entitlements and groups come from helpers of `app/src/lib/api/all-pages-query-options.ts` that fetch every page of a generated `list*` operation. The generated operations and query keys are used as they are.

| What                     | Operation                                                                                                                                      | Where                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Entitlements             | `listEntitlements` (all pages), `getEntitlement`                                                                                               | `queries/entitlements-query-options.ts`: `entitlementsQueryOptions`, `entitlementQueryOptions(slug)` |
| Groups                   | `listEntitlementGroups` (all pages)                                                                                                            | `queries/entitlement-groups-query-options.ts`: `entitlementGroupsQueryOptions`                       |
| Create, update           | `createEntitlement`, `updateEntitlement` (a PUT that replaces the whole entitlement)                                                           | `useEntitlementFormMutations`                                                                        |
| Delete                   | `deleteEntitlement`                                                                                                                            | `EntitlementTableActions`, with `optimisticDeleteCallbacks` on `listEntitlementsQueryKey()`          |
| Create a group           | `createEntitlementGroup`                                                                                                                       | `useEntitlementGroupFormMutations`, called by the group selector                                     |
| Usage of the detail page | `getEntitlementsUsageMetrics` (`GET /instances/{instanceSlug}/entitlements/usage`), one call per instance whose license grants the entitlement | `components/entitlement-detail/use-entitlement-detail-data.ts`                                       |

The updates of an entitlement (the form, the rename, the icon and the inline group editor) and of a group go through `saveEntitlementOnFresh` and `saveEntitlementGroupOnFresh` (`queries/`): the PUT replaces the object as a whole, so the object is read again and only what the caller changed is put on top of it, which keeps an icon, a group or a description saved from another tab (see [forms](../../../docs/03-patterns/forms.md#updating-an-object-the-api-replaces-as-a-whole)).

The detail page also reads all the licenses, instances and customers, and the entitlements of each license (`allLicensesOptions`, `allInstancesOptions`, `allCustomersOptions`, `allLicenseEntitlementsOptions`). It derives everything it shows from them in the browser: the linked licenses, the impacted instances and customers, the usage rows, the saturation buckets and the rankings. The logic is in `components/entitlement-detail/entitlement-detail-context-*.ts`, which the unit tests cover.

Invalidation:

- Creating an entitlement inserts it at the head of the cached list, then invalidates the list.
- Updating one invalidates the list, that entitlement, and the license entitlement queries (`getLicenseEntitlements`).
- Creating a combined entitlement, or saving one, also invalidates the usage metrics of every instance (`getEntitlementsUsageMetrics`): nothing is stored for the sum, so a new one, or new sources or weights, change what every instance reads at once.
- Creating a group inserts it in the cached groups list, then invalidates it.

`utils/entitlement-writable.ts` owns `conditionUnitFields` and `entitlementToUpdateBody`. The latter rebuilds a complete `EntitlementWritable` from a stored entitlement. Every partial edit uses it (rename in the detail header, icon dialog, inline groups), because the PUT replaces the whole entitlement and would otherwise wipe the other fields. That includes the early-warning threshold, which no screen edits: the API stores 0 (the warning off) for a numeric entitlement sent without one, so the stored value is echoed back by every update, the form's included. It also echoes where the usage of a numeric entitlement comes from (`usageSource`) and, for a combined one, its `sources` with their weights (`sourcesToBody`): the PUT replaces the sources as a whole and refuses a combined entitlement that names none, so a rename that left them out would fail. A combined entitlement sends no window and no threshold, which the API derives or refuses; a boolean or a config entitlement sends neither `usageSource` nor `sources` (the API answers 400 to them). Form schemas, inferred types, defaults and options stay in `components/form/entitlement-form.shared.ts`.

Scopes: listing and reading entitlements and groups needs `read:entitlements`; creating, updating or deleting an entitlement, and creating a group, needs `write:entitlements`. The other reads have their own scopes. The delete check reads licenses and their entitlements (`read:licenses`). The detail page reads licenses and their entitlements (`read:licenses`), instances (`read:instances`), customers (`read:customers`) and the usage metrics (`read:instances`). The screens do not check scopes themselves.

## Behaviour

**List.** The table has the columns Name (with the icon, sortable), Description, Groups, Type, Usage source (Calculated, or a Combined badge; `n/a` for a boolean or a config entitlement), Aggregation Method and a delete action. A row opens the entitlement. The search box filters on the name (200 ms debounce), and the filter bar offers Name, Description, Type, Groups, Usage source and Aggregation. The options of the Type, Groups, Usage source and Aggregation facets come from the rows themselves, so a facet only offers values that exist. The Groups cell edits inline: clicking it opens the group selector, and each change is saved at once with `updateEntitlement`. The cell puts the previous groups back and shows an error toast when the save fails.

**Groups.** A group has no page of its own. The group selector, in the form and in the list cell, searches the existing groups. When the search matches none, it offers to create a group with the typed name and selects it. Groups are only created and assigned from there: the console has no screen to rename or delete a group.

**Delete.** The delete dialog asks which licenses grant the entitlement, by reading all the licenses and their entitlements, and only when it opens. While it checks, and when at least one license grants the entitlement, the confirm button is disabled and the dialog says to remove the entitlement from those licenses first. The removal is optimistic: the row disappears, and comes back if the API refuses.

**Create.** `/catalog/entitlements/new` is a page with a stepper of two steps. Step 1 holds the name (required), the slug (optional), the icon, the description, the groups, the "User facing" switch and the display order. Next stays disabled until step 1 validates. Step 2 holds the type and the options that depend on it: for a Number, where its usage comes from, and the sources when it is combined. After a successful creation, the route opens the new entitlement's detail page.

**Unsent creation.** What is typed on the creation page and not sent is kept in the browser and offered back on the next visit ([`functionals/form-recovery`](../../functionals/form-recovery/README.md)): an alert under the title proposes Resume, which restores every field and the step it was left on, or Start over, which begins blank. The module is declared in `components/form/entitlement-recovery.ts` (`formId` `entitlements.create`, nothing omitted: no field holds a secret), opened by `EntitlementCreatePage` outside the wizard, and the wizard is mounted again, by `key`, when the entries are restored. `useEntitlementMutationForm` receives the recovery on this page only and sends a creation through `recovery.send`, so an accepted creation is never offered again, from any tab. Leaving by a link or the back button keeps the entries; Cancel discards them and a toast offers to bring them back. The `onSuccess` of the create mutation does not await the refresh of the list, since `mutateAsync` would then resolve after the page has gone. The edit dialog never uses the recovery: it starts from the entitlement as the API holds it.

**Edit.** `EntitlementFormDialog` holds the same fields in a dialog. It has two steps for a NUMBER entitlement and one for any other type, which has nothing to configure on the second step. The slug field shows the stored slug and is disabled: an entitlement is never renamed. On a combined entitlement the usage source is disabled too, but the sources and their weights stay editable, with a notice before the button that saving them re-values the present (see the form rules).

**Form rules** (`entitlementFormSchema`, built from the generated `zEntitlementWritable`):

- The slug is optional on creation and cannot change afterwards (`entitlement-slug-field.tsx`, `entitlement-slug.shared.ts`).
  - Left blank, the form leaves it out of the request and the API generates it from the name: lowercase, accents and apostrophes dropped, every other run of characters turned into one hyphen, then a hyphen and 6 random hexadecimal characters (the suffix alone when the name leaves nothing), such as `storage-reads-3fa9c1`. The placeholder shows the part the name gives on its own (`generateSlug`, which follows the API's rules), or a generic example while the name is empty, and the description under the field spells out the generated shape with an example built from the name.
  - A slug typed in the field is sent as it is. It must follow the API's format: 2 to 100 characters, lowercase letters, digits and hyphens, none at either end. The rule comes from the generated schema, with a translated message, and an invalid slug keeps Next disabled on step 1. A slug another entitlement already uses is a conflict that the API reports in an error toast.
  - An existing entitlement keeps its slug: the API answers 422 to an update that carries a different one. The edit dialog shows the stored slug in a disabled field and keeps it out of the form values, so it reaches neither the validation nor the PUT.
- The type is Boolean, Number or Config, plus Credits (`NUMBER_AI_CREDIT`) when AI is on. It is required and cannot change after creation.
- Only a NUMBER entitlement has an aggregation method (Count, Sum, Average, Min, Max or Latest; Sum by default), which cannot change after creation, a usage reset and units. For a Boolean or Config entitlement, the form drops these fields from the payload.
- A NUMBER entitlement has a usage source, Calculated (the default: the usage reported against it) or Combined (the weighted sum of other numbers). It cannot change after creation (`entitlement-usage-source-field.tsx`), and a Boolean, a Config and a Credits entitlement have none to choose: the form sends `usageSource` for a Number only, and a Credits entitlement is always calculated.
- A combined entitlement (`entitlement-sources-fields.tsx`) lists its sources, one line each: an entitlement and a weight. Choosing Combined offers two empty lines.
  - At least two sources, each line naming an entitlement, each named once (the schema flags the line that repeats). The weight is a rate and not a share, so the weights need not add up to 1: a positive exact decimal of at most 8 integer digits and 10 decimals, written as a decimal string (`0.4`, never `4e-1`), 1 when left as it is. The API writes them back in their shortest form (`0.40` becomes `0.4`), and the form seeds an edit with those.
  - A line offers only the entitlements that can be summed with the others, so that the form cannot be sent with a source the API would refuse: a Number or Credits entitlement (Credits only when AI is on) that is not combined itself, aggregated by Sum or Count, and that shares the usage window of the entitlements the other lines name (the same cadence and the same anchor, a lifetime counter included). None that another line already names. The one a line holds stays in its list even when it no longer qualifies, so that it keeps its name. The catalogue is the list this feature already reads, and a failed read shows the retry panel instead of the lines.
  - It has no window of its own to choose, and no early-warning threshold: the Usage window block says in a sentence what the window will be, the one its sources share, which the API derives (`sharedWindow`). The reset fields are not shown for it, the aggregation method shows Sum and is disabled, and a request never carries `resetPeriod`, `resetAnchor` or `warningThresholdPercent` for it (an edit that moves the sources to another window is accepted for that reason: the API re-derives the window from the new sources and writes it past the one-way door of the cadence).
  - Editing the sources or a weight of a stored combined entitlement shows an inline notice before the button: saving re-values the present, every window it counts over included, for every customer at once. It appears as soon as what the form would send differs from what is stored (`haveSameSources`).
  - The API's refusals about the sources are said in sentences of the locales and shown on the list of sources (`SOURCE_REFUSALS` of `use-entitlement-mutation-form.ts`): fewer than two sources, a source named twice, an invalid weight, an unknown source, a combined source, a source that is not a number or not summed or counted, and sources that do not share a window. 422 `UpdateEntitlement.SourceWindowLocked` is about the other side: the entitlement that is a source of a combined one is refused a cadence of its own, so it is shown above the buttons, and the cadence can be taken back.
- Usage reset: a lifetime counter (the default) or a cadence of hour, day, week, month or year, with a window anchored on the calendar, on the license start date or on the billing date. The billing date phases the windows off the billing anchor of the instance's subscription (the license start date for an instance without one), so it takes a monthly or yearly cadence only: the select lists it on a shorter one with the reason, as disabled, the form takes the calendar back when the cadence moves to one it cannot follow, and the schema refuses the pair for a client that got there anyway (`entitlement-reset-period.shared.ts`). Choosing it shows a hint that the windows follow the subscription and that a change of billing date closes the current window early. Once an entitlement stores a cadence, it can never change or be removed, and neither can its anchor: the fields become read-only with the reason, and the payload repeats the stored pair, because the PUT replaces the whole entitlement and the API refuses one that leaves the anchor out (400 `UpdateEntitlement.ImmutableResetAnchor`). The one moment the anchor is chosen after creation is when a lifetime counter adopts a cadence in an edit. The API's refusals about the pair are said in a sentence of the locales and not in the API's English (`REFUSALS` of `use-entitlement-mutation-form.ts`): 422 `CreateEntitlement.InvalidResetAnchor` and `UpdateEntitlement.InvalidResetAnchor` are shown on the anchor, which the person can change. 400 `UpdateEntitlement.ImmutableResetAnchor` and `.ImmutableResetPeriod` are about a field that is read-only, so they are shown above the buttons (`EntitlementRefusalAlert`) and not pinned to a control that cannot be edited: the form is not left stuck, and sends again. When the cadence moves off a month or a year while the billing date is chosen, the alignment goes back to the calendar and a notice says so, until the person chooses an alignment. The Latest aggregation cannot have a cadence, so the fields give way to an explanation.
- Units: a pair of labels (singular and plural) for the base unit. A "sold in different units" switch adds a sale unit: singular and plural labels, and the number of base units in one sale unit (greater than zero). The base pair is all-or-none, and the sale unit (both labels and the factor) is all-or-none and needs the base pair. The schema flags a partial configuration as invalid, and the payload builders run `conditionUnitFields`, which drops a partial configuration instead of sending it to the API. The units belong to the whole number family (`NUMBER` and `NUMBER_AI_CREDIT`, told apart by the exported `isNumberFamily`): the full-replace PUT erases what it leaves out, so an edit of an AI credit entitlement sends its units back. A boolean or a config entitlement carries none.
- The display order is a non-negative integer, 0 by default. A cleared field counts as 0.

**A delete that billing refuses.** A license is not the only thing that keeps an entitlement: an add-on that grants it, a price that meters it or a voucher boost does too, and the API refuses (409 `DeleteEntitlement.InUseConflict`) with how many of each. The console then explains it in a dialog and not a toast (`useDeletionRefusal`, `DeletionRefusalDialog` from `@/domains/billing`): what still grants or prices the entitlement, and a link to its page. The table holds that dialog, and not the row that asked: the row leaves the list while the API answers, and takes with it whatever it holds. A combined entitlement that sums the entitlement holds it as well: the dialog counts those (`combinedEntitlements`) and asks for them to be edited to drop the entitlement, or deleted, first. A price and a voucher boost are never deleted through the API, so when one of them holds the entitlement the dialog does not ask for it to be freed: it offers to hide the entitlement instead, by turning off "User facing" on its page. The row comes back, since nothing was deleted, and any other failure keeps the error toast.

**Detail page.**

- Header: the icon, which opens a dialog that saves as soon as an icon is picked or cleared; the name, editable in place; and the description.
- Stats strip: linked licenses, license alerts (licenses near their limit, from 80% to 100% saturation, and licenses over it), linked licenses with no limit, and the impact scope (instances, customers and instances at risk).
- Overview tab: the General card (type, usage source, aggregation method, usage reset, units, user facing, groups, description and audit fields), with the Edit button, and a card that lists the licenses granting the entitlement. That card puts the licenses over their limit first, then those near it, then the most used, shows five, and expands on demand. Each license links to its page and shows what it grants: a number, Unlimited, Enabled, Disabled or Configured.
- A combined entitlement shows "Combined" as its usage source and its usage window as "(from its sources)", since it has none of its own. A Sources card follows the licenses card (`entitlement-detail-sources-card.tsx`): each source with its name, slug, weight and unit, which links to the source's page, and a sentence saying the sum is computed when it is read and nothing is enforced on it. No license grants a combined entitlement, so the licenses card lists the licenses that grant its sources instead, at what they sum to (`buildCombinedLicenseMappings`: the weighted sum of the grants, none when a granted source is unlimited), and the stats strip words its count that way, so the saturation, the at-risk instances and the rankings read it as they read any other number.
- Usage tab: the saturation buckets (under 50%, 50 to 80%, 80 to 100%, over 100%, unbounded) and the top at-risk licenses, shown only once a linked license sets a limit; the at-risk instances, meaning near their limit, past the granted value inside a soft limit's tolerance, or over the limit, each with its own usage window; and the coverage by customer, which links to each customer.

### Empty and error states

The table shows the shared `DataTable` empty row ("No results") and keeps the create button. On the detail page, each card and table has its own loading and empty message. A failed create or update shows the API's error message in a toast.

## Tests

- A delete that billing refuses has an end-to-end spec of its own, `delete-refusal`, in the pack described below, and so does a combined entitlement that sums the one deleted.
- Unit tests live in `__tests__/` inside `components/form/`, `components/groups/` and `components/entitlement-detail/`. They cover form/schema/reset rules, the sources of a combined entitlement (schema, defaults, body, the lines and what each offers), complete PUT builders, group editing, detail cards (the Sources card included) and detail aggregates. Stories are colocated in each component group's `stories/` folder.
- Stories open in Storybook (`pnpm run storybook` from `app/`): `Features/Entitlements/EntitlementTable` (`Default`, `Empty`), `Features/Entitlements/EntitlementFormDialog` (`CreateNumberEntitlement`, `EditBooleanEntitlement`, `EditNumberEntitlementWithUnits`) and `Features/Entitlements/EntitlementDetailPageContent` (`Overview`). None has a `play` function. `pnpm run test:stories` renders the table stories only: `app/vite.config.ts` excludes the form dialog and detail stories, because the end-to-end pack covers them.
- End to end, run with `pnpm run test:e2e:app` from `app/`: the pack `app/e2e/app/entitlements/` has one spec per intention (`combined`, `create`, `delete`, `delete-refusal`, `display-order`, `errors`, `icon`, `read`, `recovery`, `reset-period`, `slug`, `units`, `user-facing`, `warning-threshold`) and its test data in `entitlements.scenarios.ts`. It runs on `app/e2e/app/_support/model/entitlement-app-model.ts` and the mocks in `app/e2e/app/_support/mocks/install-entitlement-app-mocks.ts`; the rules of a combined entitlement the mocks refuse by are in `entitlement-combined.ts` beside the model, in the order and with the codes of the API. The accessibility spec also visits the list.

## Public API

Routes import the following from `@/features/entitlements` (the root `index.ts`):

| Export                                                                                                              | Imported by                                                                                      |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `EntitlementsPageContent`, `entitlementsQueryOptions`, `entitlementGroupsQueryOptions`                              | `app/src/routes/catalog/entitlements/index.tsx`, `app/src/routes/catalog/entitlements/route.tsx` |
| `EntitlementCreatePage`                                                                                             | `app/src/routes/catalog/entitlements/new/index.tsx`                                              |
| `EntitlementDetailPageContent`, `EntitlementFormDialog`, `entitlementQueryOptions`, `entitlementGroupsQueryOptions` | `app/src/routes/catalog/entitlements/$entitlementSlug/route.tsx`                                 |
| `EntitlementDetailOverviewTab`                                                                                      | `app/src/routes/catalog/entitlements/$entitlementSlug/index.tsx`                                 |
| `EntitlementDetailUsageTab`                                                                                         | `app/src/routes/catalog/entitlements/$entitlementSlug/usage.tsx`                                 |
| `useEntitlementUserFacing`                                                                                          | `app/src/routes/catalog/licenses/$licenseSlug/index.tsx`                                         |

The licenses feature does not import this one; it declares its own `entitlementsQueryOptions` over the same generated operation. Its grants table offers a switch of the "User facing" flag all the same: the write stays here (`useEntitlementUserFacing`, over `saveEntitlementOnFresh`, with whether the session holds the scope of `updateEntitlement`), and the license route hands it to the table.

Only route-consumed symbols are exposed. The form, displays, table internals and
overview story alias are private to their component modules.


## Credit pool Pricing tab

An entitlement of type `NUMBER_AI_CREDIT` has a Pricing tab,
`/catalog/entitlements/$entitlementSlug/pricing` (`?version=<licenceSlug>`
highlights one row). The former `…/calculation?licenseSlug=` URL redirects there,
the licence becoming `version`. The tab is a read-only summary, not an editor:
rules are edited in AI › Pricing, the rate card, and every row links to it
(`/ai/pricing?pool=<slug>&version=<licenceSlug>`).

One row per licence version that grants the pool or carries rules for it, with
its grant per window (hard limit, overage and maximum, unlimited, not granted),
its rule count, the models priced and wildcard rules, and the cost per credit
range across the models (vendor cost of each model's default reference call
divided by the credits charged for it, computed with the pricing engine of
`domains/ai-credits`). A version that grants the pool with no rule is flagged:
every call on it is refused. Where a version does not grant the pool and an
add-on version compatible with its family can, the grant cell says "Through
add-on" with the add-on's name and opens the add-on versions (state, what each
grants, the default one): an add-on can grant the pool to an instance on the
family's versions, which does not mean every instance holds it. The names come
from a read of their own (`AiAddonGrants`, `useAddonGrants` of the domain) that
the API refuses where billing is off or without `read:addons`; the cell then
says so and keeps "Through add-on", which the rules alone establish. Rules on a
version that neither grants the pool nor has such an add-on are noted: they
price only instances that get the pool another way. Archived versions are
dimmed, never hidden. A pool neither granted nor priced
anywhere shows what to do next.

The data is the rate card's read (GraphQL `AiRateCard`, `domains/ai-credits/
rate-card`) and the REST model catalogue, which holds the vendor costs. Deleting
a credit pool clears the rate card's key: its rules go with it. The tab
needs licence, rule and model reads.

On the new-entitlement form, the type help mentions Credits when AI is on, and
the unit placeholders read credit/credits for a Credits entitlement.
