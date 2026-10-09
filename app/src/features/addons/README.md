# Add-ons

An add-on is an extra quantity of an entitlement, sold per unit on top of a license: seats, instances, history. Like a license, it has a family (the product, which the versions share) and versions, each with its own entitlements, prices and lifecycle. This feature is the catalogue, where billing is on and the release ships add-ons: it lists the families with their versions, makes a family or the next version of one, opens a version to say what one unit grants, what it is sold for and which license families it fits, moves a version through its lifecycle (publish, archive, unarchive, delete a draft) and its default flag, and lists a family in the public catalogue. What an instance holds of them, and the dialog that adds one, are the Billing tab of the instance, in [instances](../instances/README.md).

## Routes

| Path | Route file | What it renders |
| --- | --- | --- |
| `/catalog/addons` | `app/src/routes/catalog/addons/index.tsx` | `AddonsPageContent`: the families, each with its versions table |
| `/catalog/addons/new` | `app/src/routes/catalog/addons/new/index.tsx` | `AddonFormDialog` over the list: a new family. `?family=<slug>` makes it the next version of that family. A created version opens on its page |
| `/catalog/addons/$addonSlug` | `app/src/routes/catalog/addons/$addonSlug/route.tsx` | The layout of one version: `AddonDetailPage` (the title and the tabs) around the tab its child route renders. `?mode=configure` opens `AddonFormDialog` over it, to edit the version |
| `/catalog/addons/$addonSlug` (index) | `app/src/routes/catalog/addons/$addonSlug/index.tsx` | `AddonOverviewTab`: the details card, which holds what can be done to the version |
| `/catalog/addons/$addonSlug/entitlements` | `app/src/routes/catalog/addons/$addonSlug/entitlements.tsx` | `AddonGrantsTab`. `?grant=new` and `?grant=<entitlementSlug>` open the dialog of a grant |
| `/catalog/addons/$addonSlug/prices` | `app/src/routes/catalog/addons/$addonSlug/prices.tsx` | `AddonPricesTab`. `?price=new` opens the drawer of a price |
| `/catalog/addons/$addonSlug/compatibility` | `app/src/routes/catalog/addons/$addonSlug/compatibility.tsx` | `AddonCompatibilityTab`: the license families the version fits |

The routes mirror the licenses' (`/catalog/licenses`, `/catalog/licenses/$licenseSlug/...`) and the dialogs follow [dialog via route](../../../docs/03-patterns/dialog-via-route.md): a link carries the dialog, the back button closes it, and a link to one that cannot open (a grant the version does not have, a price on an archived version, a session that may not write) leads back to the tab.

The add-ons are billing's. `/catalog/addons` has the guard: `routes/catalog/addons/route.tsx` calls `requireBillingCapability(context.queryClient, 'addons')` in its `beforeLoad` and has `BillingNotFound` as its `notFoundComponent`, so every route under it is guarded at once. Where billing is off, or the release does not ship the add-ons (`features.addons` of `GET /billing/capabilities`), a link to any of them explains why in place of the screen, and nothing of the catalogue is requested but the capabilities. The entry of the Catalog section of the side navigation (`catalogSubRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`) is listed under the same condition, and only to a session that may read the add-ons (`action: 'addons.list'`).

## Structure

```txt
app/src/features/addons/
├── components/
│   ├── pages/              # addons-page-content, addon-detail-page (the layout and its tabs), addon-overview-tab,
│   │                       # addon-details-card (what a version is, and what can be done to it)
│   ├── list/               # addon-list (the filters), addon-list-item (a family), the versions table, its columns
│   │                       # and actions, addon-family-public-toggle
│   ├── actions/            # publish, archive and unarchive with confirmation, set or unset the default,
│   │                       # delete a draft, and the badge of the state (the dialog, the looks and the guards
│   │                       # they share with the licenses are the billing domain's; here are the words, the
│   │                       # permission and the operation)
│   ├── form/               # addon-form-dialog and its fields: a new family, the next version, an edit
│   ├── grants/             # the Entitlements tab: table, row actions, dialog and fields, license-overage-warning
│   ├── prices/             # the Prices tab: the slot of each billing period, table, drawer, the question before
│   │                       # a default is replaced, the deprecation dialog
│   ├── compatibility/      # the boxes of the license families
│   ├── frozen-version-dialog.tsx   # what a change to a version that cannot change leads to
│   ├── version-state-note.tsx      # what the state of a version means for a tab, and the way to a new version
│   ├── __tests__/, stories/
│   └── index.ts
├── hooks/                  # use-addon-form, use-addon-lifecycle-transition, use-addon-default, use-delete-addon-draft,
│                           # use-addon-family-visibility, the grants (use-addon-grants, -grant-form, -grant-mutations,
│                           # use-grant-dialog-target, use-license-overage), the prices (use-addon-pricing,
│                           # -price-form, -price-mutations, use-price-drawer-target) and use-addon-compatibility
├── queries/                # addon-query-options.ts, addon-query-invalidation.ts, addon-holders.ts
├── schemas/                # addon, addon-grant and addon-price schemas (derived from the generated Zod ones),
│                           # their form options, and the mappers of the bodies
├── types/index.ts          # AddonGroup, AddonHolder
├── utils/                  # families, lifecycle, grants, prices (slots, the next display order), quantity, freeze,
│                           # and addon-labels.ts (the keys of the labels, written out)
└── index.ts
```

## Data

Every read is REST, and the API answers a plain array for each list of the add-ons.

- `addonFamiliesQueryOptions` reads `GET /addon-families`, every family with its versions, and is the one place that turns the array into the shape the other lists have (`toListPage`, in `app/src/lib/api/pagination.ts`): a paged answer, the day it comes, changes this read and nothing the screens do. It keeps the generated key. The same reading is what the Billing tab of an instance selects add-ons from.
- `addonQueryOptions(addonSlug)` reads one version and `addonGrantsQueryOptions` what it grants. Its prices (`addonPricesQueryOptions`, in the order the API lists them: display order, then id), the slugs of the license families it fits (`addonCompatibilityQueryOptions`) and the license families (`addonLicenseFamiliesQueryOptions`) are read the same way by the Billing tab of an instance, so they are the billing domain's (`@/domains/billing`); none is retried, a refusal of billing being the screen's to show.
- `entitlementsQueryOptions` and `licenseGrantsQueryOptions` read what the screens name things after: the entitlement catalogue a grant is picked from, and what a license version grants (to compare overages).
- `addonHoldersQueryOptions(addonSlug)` finds who holds a version: the instances, then the add-ons of each, six at a time, a 404 being no match. It is read only when a person asks to lower the maximum quantity of a version.

Writes use the generated mutations (`createAddonMutation`, `updateAddonMutation`, `assignAddonEntitlementMutation`, `updateAddonEntitlementMutation`, `unassignAddonEntitlementMutation`, `createAddonPriceMutation`, `deprecateAddonPriceMutation`, `setAddonCompatibilityMutation`, `removeAddonCompatibilityMutation`, `updateAddonFamilyMutation`) and the SDK functions `publishAddon`, `archiveAddon`, `unarchiveAddon` and `deleteAddon`. None is optimistic: a refusal must never show as a success.

The helpers of `queries/addon-query-invalidation.ts` invalidate with the generated keys: `invalidateAddonQueries(queryClient, addonSlug?)` the families and the versions (and one version's detail), `invalidateAddonDetails` every detail (moving a default takes the flag from another version), and one helper each for the grants, the prices and the compatibility of a version. A lifecycle transition writes the version the API returns into its detail cache.

## Behaviour

Everything below is gated by the scopes of the session: an action is offered only to a session whose scopes cover its operation (`useCanPerform`, `useActionAccess`, with the actions of `BILLING_ACTIONS` in `@/domains/billing`), and a session that may only read sees the catalogue with none of its controls.

- **Families.** Versions are grouped by family slug. A family is shown under its head version (the one the API resolves it to, else its newest) and a new version starts from it. The first family is open when the page loads. The filters (name, pinned; state; pricing) run in the browser and survive a refetch, so an action on a version does not clear the search. A family reads with its version count, a `Default: <version>` badge and, when it is listed in the public catalogue, a Public badge.
- **Make an add-on.** The dialog takes a name, an optional slug, a description, how it is sold (free, paid or custom), a version name, the most units an instance can hold (empty: unbounded) and "Create as a draft", ticked: a new version is a draft, so that it can be given its entitlements, its prices and the licenses it fits before it goes on sale. The slug of a first version is the slug of its family, the next ones are `{family}-v{n}`, and the API names what the form leaves out. **The next version starts empty**: the API copies no entitlement, price or license from the version before it, and the dialog says so. A refused slug or maximum is shown on its field. A created version opens on its page.
- **Lifecycle.** A version is a draft, published or archived. Each state offers one transition (publish a draft, archive a published version, unarchive an archived one), each after a confirmation that names it; publishing says what it changes: its prices can no longer be edited, its entitlements freeze once an instance with a live subscription holds it, and it is attachable only to the families it fits. Nothing leads back to a draft. The default of a family is a published version (`UpdateAddon.DefaultMustBePublished`), and the default cannot be archived until another takes its place or the flag is unset: the action stays visible, disabled, with the reason on hover and focus. Only a draft can be deleted, with its prices and entitlements; a version an instance ever held is history, and the words of the API are shown.
- **The maximum quantity.** The API takes any `maxQuantity` and checks it against nothing, so lowering it under what an instance holds would leave a quantity the version no longer allows. The console reads who holds the version first (`addonHoldersQueryOptions`, only when the maximum is lowered) and stops the change on the field, naming the instance and its quantity. Raising it, keeping it or removing it needs no look.
- **Entitlements.** What **one unit** grants: a number (counted once per unit of quantity, or unlimited), a flag or a configuration, picked from the entitlement catalogue the version does not grant yet. A number says how it combines with what the license grants (`overrideBehavior`): added to it (`ADD`), replacing it (`OVERRIDE`), or the larger of the two (`MAX`, the default of the API). Its **overage allowance** is empty to inherit the license's (the member is left out of the body, which the form calls "Inherit"), a whole percentage when set, `0` being a hard limit; an unlimited value allows none. The overage is replaced and not merged on an update. When the allowance set is lower than a license the version fits grants, the dialog warns, naming the license and both percentages and saying that the add-on's replaces the license's on every instance that attaches it (`LicenseOverageWarning`, over `useLicenseOverage`: it reads what the head version of each compatible family grants, for a session that may read licenses). A grant a price meters cannot be removed: the dialog shows the API's words.
- **Prices.** A flat fee for a billing period; the API takes a metered price on a version and never values it, so the console lists only the flat fees and says how many metered ones it leaves out. A price is created and deprecated, never edited. Of the flat fees of a version the **default active one of a period** is the one that bills an instance on a subscription of that period, so the tab shows a slot for each usual period (monthly and annual, and any other the version has a price for) and says when a priced version has none: it cannot be attached to such a subscription. The first price of a period is the default; making another the default asks first, naming the price it replaces (the API replaces it in silence); the default of a period cannot be deprecated, and its button stays, disabled, with the way out. A version bills in one currency, fixed by its first price (`CreateAddonPrice.CurrencyMismatch` is shown on the field). An archived version takes no new price, and the amount goes out in minor units as the string typed (`lib/money`).
- **Compatible licenses.** A box for each license family. Compatibility is declared against a family, not a version, so a new license version never orphans an add-on. Both calls are idempotent: a box asks for the state it shows, is off while its request is on its way and shows what the API holds. A version that fits none is attachable to nothing and the API publishes it all the same, so the tab says so in a warning.
- **A frozen version.** A live subscription freezes the entitlements and the prices of a version, and an archived version takes no new price. The API refuses with a code for each (`*.BillingActive`, `CreateAddonPrice.VersionArchived`: `getAddonFreezeReason`) and every refusal has the same answer, a new version. `FrozenVersionDialog` says what the API said and links to `/catalog/addons/new?family=<slug>`; it is a dialog and not a toast, and the form it came from closes. The way is offered before any refusal too, in the note of the Entitlements and Prices tabs (`VersionStateNote`).
- **The public catalogue.** A family is private until listed. The switch of a family (`PATCH /addon-families/{familySlug}`, the flag alone) shows what the API answered, not what was clicked, and a refusal is said in a toast.

## Tests

- Unit and component tests (Vitest), next to the code: `components/__tests__/` (the list, the form dialog, the three tabs, with their shared `addon-test-support.tsx`), `queries/__tests__/` (the reads, the holders of a version), `schemas/__tests__/` (the forms and the bodies they build) and `utils/__tests__/` (families, lifecycle, grants, prices and their slots, quantity, freeze). `app/src/__tests__/billing-addon-mocks.test.ts` reads, off the wire, what the mocks of the catalogue answer: they refuse as the API does, with its codes, because the console is tested against them.
- Stories: `components/stories/addon-screens.stories.tsx` (`Features/Addons/Screens`: the entitlements, the prices and the compatibility of a version in their states, with the refusal of a frozen version) runs as a test. `addon-catalogue.stories.tsx` (`Features/Addons/Catalogue`: the list) is in `storybookTestExclude` of `app/vite.config.ts`: its accordion trigger is the shared `ActionAccordion`, whose headings the axe check of the stories does not accept, and the E2E specs cover what it shows.
- E2E, `app/e2e/app/addons/`, on the world of `addons.scenarios.ts` (the catalogue, the license families, the instances that hold a version) installed by `install-addons-world.ts`, and the drivers of `app/e2e/app/_support/drivers/addon*.driver.ts`: `addons.read.spec.ts` (the list, the search and the filters, the page of a version and its tabs), `addons.lifecycle.spec.ts` (make a family, the next version, edit and the maximum, publish, archive, the default, delete a draft, the public catalogue), `addons.entitlements.spec.ts` (each kind of grant and the body it sends, the overage warning, remove, a frozen version), `addons.prices.spec.ts` (the slots, add, the default that is replaced, deprecate, the currency, a frozen version), `addons.compatibility.spec.ts`, `addons.access.spec.ts` (the navigation entry, a release without add-ons, a session that may only read) and `addons.french.spec.ts`. Beside them, `accessibility/accessibility.addons.spec.ts` (no axe violation in both themes, each dialog and drawer keeping the focus, Escape to close) and `mobile/mobile.addons.spec.ts` (375 px: no sideways scroll, the tables scroll inside their card, the dialogs fit).

## Public API

`app/src/features/addons/index.ts` exports `AddonsPageContent`, `AddonDetailPage`, `AddonOverviewTab`, `AddonGrantsTab`, `AddonPricesTab`, `AddonCompatibilityTab`, `AddonFormDialog` and the query options of the families, a version, its grants and the entitlements (`getAddonTitle`, the prices, the compatibility and the license families are the billing domain's). Only the routes under `app/src/routes/catalog/addons/` import them, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)). The invalidation helpers and everything else are internal to the feature.

The feature imports no other feature. It shares code through `@/domains/billing` (the gate, the scopes and the actions, the refusals, the amounts, the periods and the words of a price, `PriceAmount`), `@/domains/entitlement-usage` (the unlimited threshold) and `@/functionals`. The Billing tab of an instance reads the add-on catalogue through its own query options (`features/instances/queries/instance-addon-query-options.ts`) over the same generated operations and keys.

The table and filter building blocks come from [`functionals/table`](../../functionals/table/README.md) and [`functionals/filters`](../../functionals/filters/README.md).
