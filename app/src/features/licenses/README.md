# Licenses

In the API, one license is one version of a product, and the versions of the same product share a `familyId`. Each version grants entitlements: a limit, a flag or a configuration per entitlement. This feature lists the versions grouped by product (a family), creates a license or a new version of one, opens a version to manage its grants, and moves a version through its lifecycle (publish, archive, unarchive, delete a draft) and its default flag.

## Routes

| Path | Route file | What it renders |
| --- | --- | --- |
| `/licenses` | `app/src/routes/licenses/index.tsx` | `LicensesPageContent`: the families, each with its versions table |
| `/licenses/new` | `app/src/routes/licenses/new/index.tsx` | `LicenseForm`: a new license, which opens a family |
| `/licenses/$licenseSlug` | `app/src/routes/licenses/$licenseSlug/index.tsx` | `LicenseDetailPage`: one version and its grants. The breadcrumb is the version's name |
| `/licenses/versions` | `app/src/routes/licenses/versions/index.tsx` | Redirects to `/licenses` |
| `/licenses/versions/new` | `app/src/routes/licenses/versions/new/index.tsx` | `LicenseVersionForm` with the family and the base version to choose |
| `/licenses/versions/$licenseSlug` | `app/src/routes/licenses/versions/$licenseSlug/index.tsx` | `LicenseVersionForm` on the family of that version, which is the base. The breadcrumb reads `New version of <name>` |

`/licenses` is an entry of the side navigation (`topLevelRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`). The create and version forms are full pages, not dialogs.

## Structure

```txt
app/src/features/licenses/
├── components/
│   ├── pages/                          # licenses-page-content, license-detail-page, details card
│   ├── forms/                          # license-form (create), license-version-form and its schema, layout, fields
│   ├── entitlements/                   # LicenseEntitlementsCard: table, inline editors, add dialog
│   ├── license-list.tsx                # families accordion and its filters
│   ├── license-list-item.tsx           # one family: header, "New Version", versions table
│   ├── license-versions-table.tsx      # versions of a family
│   ├── license-versions-table-actions.tsx
│   ├── license-lifecycle-action.tsx    # publish, archive, unarchive, with confirmation
│   ├── license-lifecycle-badge.tsx
│   ├── license-delete-draft-action.tsx
│   ├── __tests__/, stories/
│   └── index.ts
├── hooks/                              # use-license-save, use-license-default, use-license-lifecycle-transition,
│                                       # use-delete-license-draft, and the hooks over the stores
├── queries/license-query-options.ts    # query options and invalidation helpers
├── schemas/license.schema.ts           # licenseFormSchema, derived from the generated zLicenseWritable
├── store/                              # TanStack Store: draft grants, card editing state, version form
├── types/index.ts                      # LicenseWithInstances, LicenseGroup
├── utils/                              # families, lifecycle, grants (read model and write bodies), version names
└── index.ts
```

## Data

Reads, all REST. The `all*Options` helpers in `app/src/lib/api/all-pages-query-options.ts` keep the key of the generated first-page options and walk every page.

- `licensesWithInstancesQueryOptions` (key `['licenses', 'with-instances']`) walks every page of `getLicenses` and `getInstances`, and adds `nbInstances` to each version: the number of instances whose `licenseId` is the version's id. It feeds the list.
- `licenseFamiliesQueryOptions` reads `GET /license-families`.
- `licensesQueryOptions` reads every version; the version forms use it.
- `licenseQueryOptions(licenseSlug)` reads one version.
- `licenseEntitlementsQueryOptions(licenseSlug)` reads the grants of one version.
- `entitlementsQueryOptions` reads the entitlement catalog, which the grant picker offers.

The route loaders ensure what their page reads: the list loads the versions with instances and the families; the detail loads the version, its grants and the catalog; the create routes load the catalog, and the version routes also the versions, the families and, for `/licenses/versions/$licenseSlug`, the base version.

Writes use the generated mutations (`createLicenseMutation`, `publishLicenseMutation`, `updateLicenseMutation`, `associateEntitlementWithLicenseMutation`, `updateLicenseEntitlementMutation`, `deleteLicenseEntitlementMutation`) and the SDK functions `publishLicense`, `archiveLicense`, `unarchiveLicense`, `deleteLicense` and `deleteLicenseEntitlement`.

Three helpers in `app/src/features/licenses/queries/license-query-options.ts` invalidate:

- `invalidateLicenseLists` marks the three lists stale: `getLicensesQueryKey()`, the with-instances key and `listLicenseFamiliesQueryKey()`. Only the lists on screen refetch.
- `invalidateLicenseDetails` marks every version's detail stale.
- `invalidateLicenseQueries(queryClient, licenseSlug?)` invalidates the lists and, with a slug, that version's detail and grants, then refetches them all.

A lifecycle transition writes the version the API returns into the detail cache (`setQueryData`) and invalidates the lists. A default change invalidates the lists and every detail, because moving a family's default changes two versions and only the server knows which one lost the flag. A draft deletion invalidates the lists. The create forms call `invalidateLicenseQueries` without a slug, and the grant mutations of the detail page call it with the version's slug.

## Behaviour

- **Families.** Versions are grouped by `familyId`, never by name: a version can be renamed without leaving its family, and two families can share a name. The family is shown under its head version, the `currentVersion` that `GET /license-families` returns; a new version starts from it. A family with nothing published has no `currentVersion` and is shown under its highest version (`getFamilyHeadLicense`). The list, the version picker and the detail never display a license or family slug: a product reads by name and a version by name and number, so two families with the same name look the same.
- **List.** One accordion item per family, sorted by name, with a version count and a `Default: <version>` badge. The first family is open when the page loads. The filters (name, pinned; type; version name; version) run on the client with a 200 ms debounce and survive a refetch, so an action on a version does not clear the search. A filter that hides the head version does not rename the family. "New License" opens `/licenses/new`; "New Version" opens `/licenses/versions/$licenseSlug` on the head version and is disabled when the family has none. A row of the versions table opens the version. The controls of the actions cell stop the click from reaching the row.
- **Lifecycle.** A version is a draft, published or archived; a version with no state reads as published. Each state offers one transition: publish a draft, archive a published version, unarchive an archived one. Nothing leads back to a draft. Each transition asks for confirmation, and the dialog keeps the transition it opened for even if the version is refetched meanwhile. The API moves the state only through these operations; an update never sends it. The default version of a family cannot be archived: the button is disabled with the reason, until another version becomes the default or the flag is unset. When the API refuses a transition, the toast shows its message and the version's detail is invalidated, since a refusal usually means the version moved.
- **Default.** "Set as default" is offered on published versions only, disabled with a tooltip on the others. The version that holds the flag shows "Unset default" instead.
- **Delete a draft.** Only a draft offers "Delete" (archiving is for versions that have been on sale). It removes the grants first, then the version, since the API refuses to delete a version that still grants something. An instance still on the draft makes the API refuse, and the toast says so. From the detail page a successful delete returns to `/licenses`.
- **Create a license.** The form has a name (required), an optional slug that follows the name and that the API generates when empty, a type (development, trial, paid or community), a version name, a description and "Save as draft". The version number is assigned by the API. The license is created as a draft, given its grants, then published unless "Save as draft" is checked, so a family never serves a version with half its grants (`useLicenseSave().createLicenseWithGrants`). If a grant or the publish fails, the license stays a draft, a toast says `Saved as a draft, not published: <reason>`, and the app opens its page to finish. If the create itself fails, nothing is saved. Success returns to `/licenses`.
- **New version.** The body carries the base version's `familyId`, name and type; sending the name alone would open a second product under that name. The family and the base version are selects, locked when the route names the base. The type is the base's and cannot change. Choosing a base fills the description, suggests the next version name (`suggestNextVersionName`: the highest trailing number among the family's names plus one, keeping the zero padding, and nothing for names like "GA") and copies the base's grants into the editor; "Reset" clears them. Opened from a family the form is complete, so it can be submitted without an edit (`allowPristine` while the values pass `licenseVersionFormSchema`). It saves like a new license, as a draft first, and can also start as a draft.
- **Grants.** `LicenseEntitlementsCard` lists the grants of a version: entitlement, type, threshold, overage allowance and a remove action. In the create forms it edits a local draft (`useLicenseEntitlementsDraft`) that is sent on submit; on the detail page every add, edit and removal is sent at once. The add dialog offers the catalog entitlements not yet attached. A number grant takes a threshold, or "Unlimited", and an overage allowance; a boolean grant takes on or off; a configuration grant takes a JSON object.
- **Limits.** A number grant carries the threshold and `limitCapExceededOveragePercent` together, and the API derives enforcement from the pair: `-1` when the threshold is unlimited, `0` for a hard limit, a positive percentage for a soft limit bounded by `threshold × (1 + percent / 100)`. `resolveLimitCapExceededOveragePercent` (`@/domains/entitlement-usage`) mirrors that rule, and every write sends both values, because the API resets an omitted percent to a hard limit. Boolean and configuration grants carry no percent. `NUMBER_AI_CREDIT` is folded into `NUMBER` (`toEditableEntitlementType`), so it gets the same editor.
- **Inline edit.** On the detail page and in the create forms, the threshold and the overage allowance edit in place. A threshold accepts an integer of `-1` or more, or "Unlimited" or an empty value for no limit; an overage allowance accepts a whole percentage of `0` or more, and an empty value means a hard limit. The overage cell is read-only while the threshold is unlimited. Saving one half writes the pair, taking the other half from the row. On the detail page a click on a row opens the entitlement at `/entitlements/$entitlementSlug`; the inline editors and the remove button stop the click, and a row being saved does not navigate.
- **No edit.** The detail page is read-only apart from the grants, the lifecycle state and the default flag. `LicenseForm` has an update branch (its `license` prop) that no route mounts, so the console does not edit the name, type, description or version name of an existing version.

## Tests

- Unit and component tests (Vitest), next to the code:
  - `app/src/features/licenses/components/__tests__/`: `license-form`, `license-lifecycle-action`, `license-version-form`, `license-versions-table`, `license-versions-table-actions` and `use-license-version-form-options`.
  - `app/src/features/licenses/components/entitlements/__tests__/`: `add-entitlement-dialog`, `license-entitlements-card` and `use-add-entitlement-action`.
  - `app/src/features/licenses/hooks/__tests__/`: `use-license-entitlements-draft` and `use-license-save`.
  - `app/src/features/licenses/store/__tests__/`: `license-entitlements-card-store` and `license-entitlements-draft-store`.
  - `app/src/features/licenses/utils/__tests__/`: `license-entitlement-write.utils`, `license-entitlements.utils`, `license-lifecycle.utils`, `license-list.utils` and `license-version-name.utils`.
- Stories: `app/src/features/licenses/components/stories/license-table.stories.tsx` (`Features/Licenses/LicenseList`: `Default`, `Empty`, `WithoutInstances`). The `Default` data has a draft, a published default and an archived version in one family. The visual regression suite does not cover these stories.
- E2E: `app/e2e/app/licenses/` holds `licenses.read.spec.ts` (a family with the state and the transition of each version), `licenses.lifecycle.spec.ts` (publish, cancel, archive and unarchive, the withheld archive of the default, the reason the API gives when a version moved) and `licenses.versions.spec.ts` (a draft version, a published version, a version from the suggested values), with their data in `licenses.scenarios.ts`.

## Public API

`app/src/features/licenses/index.ts` exports `LicensesPageContent`, `LicenseDetailPage`, `LicenseForm`, `LicenseVersionForm` and the query options `licensesQueryOptions`, `licensesWithInstancesQueryOptions`, `licenseFamiliesQueryOptions`, `licenseQueryOptions`, `licenseEntitlementsQueryOptions` and `entitlementsQueryOptions`. Only the routes under `app/src/routes/licenses/` import them, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)). The invalidation helpers and everything else are internal to the feature.

The table and filter building blocks come from [`functionals/table`](../../functionals/table/README.md) and [`functionals/filters`](../../functionals/filters/README.md).
