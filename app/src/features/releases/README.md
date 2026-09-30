# Releases

A release is an immutable bundle of component versions that is deployed to deployment zones. The feature lists releases with their status, creates a release from scratch or from an existing one, shows one release with the zones that run it, and deletes a release. Deploying a release to a zone belongs to [deployment zones](../deployment-zones/README.md), and the component catalog to [components](../components/README.md).

## Routes

The layout route `app/src/routes/releases/route.tsx` preloads the release list and the deployment zones for every page below it. The release-management workspace has three tabs, Releases, Components and Deployment Zones, drawn by `app/src/functionals/release-management`.

| URL | Route file | What it renders |
| --- | --- | --- |
| `/releases` | `app/src/routes/releases/index.tsx` | `ReleasesPageContent`: every release with its components, zones and instances. The loader preloads the release overview. |
| `/releases/deployments` | `app/src/routes/releases/deployments/route.tsx` | `DeploymentsPageContent`: a second list of the same releases, with a delete action per row. The loader preloads the release overview. It is not a tab: the console navigates here after a release is deleted from its detail page. |
| `/releases/deployments/new` | `app/src/routes/releases/deployments/new/index.tsx` | Redirects to `/releases/new`. |
| `/releases/new` | `app/src/routes/releases/new/index.tsx` | `ReleaseForm`. The loader preloads the release overview and the component list. |
| `/releases/$releaseSlug` | `app/src/routes/releases/$releaseSlug/route.tsx` and `index.tsx` in the same folder | `ReleaseDetailPageContent` and, in it, `ReleaseDetailOverviewTab`. The loader preloads the release, the overview and the deployment zones. |
| `/releases/$releaseSlug/deployment-zones` | `app/src/routes/releases/$releaseSlug/deployment-zones.tsx` | `ReleaseDetailDeploymentZonesTab`. |
| `/releases/$releaseSlug/deploy` | `app/src/routes/releases/$releaseSlug/deploy.tsx` | `DeployToZoneDialog`, from `features/deployment-zones`, opened over the detail page. |

## Structure

```text
app/src/features/releases/
├── components/
│   ├── release-detail/       # detail layout, context, Overview and Deployment Zones tabs
│   ├── release-form/         # the creation stepper, its steps and dialogs
│   ├── release-overview/     # displays/, stats/ and tables/ of the two list pages
│   ├── stories/
│   ├── deployments-page-content.tsx
│   ├── releases-page-content.tsx
│   └── index.ts
├── hooks/                    # useReleaseForm, useReleaseBaseChangeController, useDeleteReleaseMutation
├── queries/                  # releasesQueryOptions, releaseQueryOptions, invalidateReleaseQueries
├── schemas/release.schema.ts # form schema, per-step schemas, payload normalization
├── types/
├── utils/release-detail-helpers.ts
├── index.ts
└── README.md
```

In `release-form/`, `create-stepper.tsx` holds the stepper and its Back, Next and Create buttons; `shared.tsx` the list of steps and the messages that explain why a button is disabled; `release-form-base-selector.tsx`, `release-form-information-card.tsx` and `release-form-components-card.tsx` the three steps; `release-form-add-catalog-dialog.tsx` and `release-form-component-dialog-host.tsx` the two component dialogs; `dialogs/release-base-change-confirmation-dialog.tsx` the reset confirmation; and `component-changes/release-component-changes.utils.ts` the helpers that edit the form's component patches.

## Data

| Screen | Reads |
| --- | --- |
| `/releases` | `releaseManagementOverviewQueryOptions`: GraphQL `GetReleaseManagementOverview`, exported by `@/domains/release-management`. It returns each release with its components, the zones it ever reached and its instances. |
| `/releases/deployments` | `releaseManagementOverviewQueryOptions`, like `/releases`: only the overview holds the zones a release ever reached, which the status needs. |
| detail | `releaseQueryOptions(releaseSlug)` (REST `GET /releases/{releaseSlug}`) in the route, then the overview and the deployment zones in `ReleaseDetailProvider`. The zones only stand in for a release the overview does not hold yet. |
| form | the overview, for the base releases, and `allComponentsOptions()` (REST `GET /components`, every page), for the catalog. |

`allReleasesOptions`, `allDeploymentZonesOptions` and `allComponentsOptions` are in `app/src/lib/api/all-pages-query-options.ts`. They keep the query key of the generated first-page options, so one invalidation reaches every screen.

Mutations:

- `createRelease`, called by `useReleaseForm` with the version, an optional slug and description, and `componentIds`.
- `deleteReleaseMutation`, wrapped by `useDeleteReleaseMutation`. It removes the release from the cached REST list at once and restores the list if the request fails. That list feeds the deployment zone screens (the zone list, the zone detail and the deploy dialog of a zone) and the instance detail, not the two release tables: they read the overview, which this hook leaves alone and which the invalidation refetches once the request succeeds.
- `createComponentMutation` and `updateComponentMutation`, called by the shared `ComponentFormDialog` when the form's component dialogs save.

`invalidateReleaseQueries(queryClient, releaseSlug?)` invalidates the release, component and deployment zone lists, the overview, and the release itself when a slug is given. `useReleaseForm` calls it after a creation and `useDeleteReleaseMutation` after a deletion. The overview is GraphQL and the lists are REST, so both keys are invalidated; see [query key invalidation](../../../docs/02-conventions/query-key-invalidation.md).

## Behaviour

### Status

A release has one of four statuses: Deployed, Staging, Superseded or Planned. One rule picks it, `getReleaseOverviewStatus` in `app/src/domains/release-management/logic/release-management-overview.ts`, and every screen that shows a release's status goes through it:

- A release runs on a zone when the zone's current release is this release. The overview lists every zone a release has ever reached, so `getCurrentDeploymentZones` keeps only the zones that still run it.
- Deployed: a zone that counts as production runs it. Any type counts as production except `staging` and `development`; a zone type is free-form, so an organization's own types count.
- Staging: only staging or development zones run it.
- Superseded: it reached a zone and no zone runs it now.
- Planned: it never reached a zone.

Superseded and Planned both mean that no zone runs the release, so the zones that run it cannot tell them apart: only the zones it ever reached can. The overview carries them (`Release.deploymentZones` in GraphQL); neither REST endpoint does, since a zone only knows the release it runs now. So every screen that shows a status reads the overview: `/releases`, `/releases/deployments`, the detail page, the releases dialogs of the catalog and of a zone, and the release card of an instance. A status worked out from the REST zones alone would show a superseded release as Planned.

The one exception is a release the overview does not hold yet, such as a release created a moment ago before the overview refetched. The detail page and the instance card then pass the zones that run it as its history to the same function. Nothing is known of an earlier run, so the status is Deployed, Staging or Planned until the overview arrives.

### Lists

- `/releases` shows Version (a link to the detail), Status, Components, Deployment zones, Instances, Created and Description. The components, zones and instances open a dialog. Zones and instances are those of the zones that run the release now, and the zones column reads "Not deployed" for a release that runs nowhere. Filters are Version (the search box), Status, Deployment zones and Created at. The five cards are Total, Deployed, In Staging, Superseded and Planned, and the four statuses add up to the total. The empty state reads "No releases yet. Create one to get started."
- `/releases/deployments` lists the same releases, with the same statuses, cards and Status filter (all four values). It shows Version, Status, Deployment zones and Created, with a delete action per row. The zones column and the Deployment zones filter cover the zones that run the release now, as on `/releases`.

[Tables](../../../docs/03-patterns/tables.md) describes the shared table pattern.

### Creating a release

`/releases/new` is a three-step form: Release base, Information, Components. The stepper lets a user go back to any step already reached. Next stays disabled, with a tooltip that lists the reasons, until the step is valid. The header has a Cancel button that goes back to `/releases` without a confirmation.

1. **Release base.** "Start from scratch" or "Use existing release", the latter with a picker of the existing releases, highest version first. This step is skipped when the organization has no release: the form opens on Information in scratch mode. Once a base is chosen, the page title carries a badge, "Based on <version>" or "Start from scratch". Changing the base after component edits asks for confirmation, then clears the component selection and edits; version, slug and description stay.
2. **Information.** Version is required, and typing it fills the slug. Slug is optional: an empty slug is not sent and the API generates one. Description is optional.
3. **Components.** A table whose rows are either inherited from the base release (`Inherited` badge) or taken from the catalog (`Catalog` badge). An inherited row can be edited (`Edited` badge) or removed (the row dims, gets a `Removed` badge and offers an undo). A catalog row can be edited with the pencil or removed with the trash icon, which drops it from the selection. "Add from catalog" opens a searchable multi-select dialog of the catalog components that are neither selected nor inherited. "Create new" opens the shared `ComponentFormDialog`, and the pencil of a row opens it to edit.

The component dialogs save at once: a component created in the form stays in the catalog if the release is never created. The API updates a component in place when no release ships it, and creates a new version when a release does; the form then uses the component the API returns in place of the one that was edited. When a release ships the component, the API only accepts an update that changes its name or version. Otherwise it answers 400 and the dialog shows the error in a toast, so editing only the description of such a component fails.

Create Release is enabled when the whole form is valid and has changed, and the tooltip on the disabled button says what is missing. The submitted components are those of the base release, minus the removed ones, with each edited one replaced by its new version, plus those chosen in the form. On success a toast reads "Release created successfully" and the console opens the new release, or the list when the release has no slug. On failure an error toast carries the API message and the form stays as it is.

### Detail

- The header shows the version, the status badge, the description ("No description provided." when empty), a Deploy button that opens `/releases/$releaseSlug/deploy`, and a Delete button that asks for confirmation. A release is immutable, so there is no edit action and no "updated" date.
- Three cards: Deployment zones and Production zones (the zones that run the release), and Last deployment update (the most recent update among those zones, or "Never").
- **Overview** tab: General Information (version, slug, id, status, description, creation date and author), Deployment Footprint (the number of zones, one row per zone type, and the first five zones, each linking to `/releases/deployment-zones/$zoneSlug`) and Components (name, version and description of what the release ships).
- **Deployment Zones** tab: the zones that run the release, each linking to the zone. With none, the tab offers "Deploy to a zone".
- The API refuses to delete a release that has been deployed to a zone, even one that a newer release has replaced since (409); the console then shows only the toast "Failed to delete release". A successful deletion shows "Release deleted successfully" and navigates to `/releases/deployments`.

## Tests

- `app/src/features/releases/components/release-form/__tests__/release-form.test.tsx`: the stepper, the base step and the step that is skipped, the blockers tooltip, the base picker and badge, the components step and Cancel.
- `app/src/features/releases/components/release-form/__tests__/release-form-components-columns.test.ts`: the rows of the components step.
- `app/src/features/releases/components/release-detail/__tests__/release-detail-page-content.test.tsx`: the detail metrics and status from the overview and their fallback to the REST zones, a superseded release, and the components card.
- `app/src/features/releases/components/__tests__/release-status-surfaces.test.tsx`: `/releases` and `/releases/deployments` over the same overview, which must show the same status for each release, a superseded one included, and the same counts in the cards.
- `app/src/features/releases/hooks/__tests__/use-release-form.test.ts`, `app/src/features/releases/schemas/__tests__/release.schema.test.ts` and `app/src/features/releases/utils/__tests__/release-detail-helpers.test.ts`.
- The status rules are tested in the domain: `app/src/domains/release-management/logic/__tests__/`. The other screens that show a status are tested where they live: `features/components` (the releases dialog), `features/deployment-zones` (the releases dialog of a zone) and `features/instances` (the release card). Each of those three is also tested in French against the real locale bundle.
- Stories in `app/src/features/releases/components/stories/`: `Features/Releases/ReleaseForm`, `Features/Releases/ReleaseTable` and `Features/Releases/ReleaseLinkedDeploymentZonesDisplay`. The form and table stories need the router and mutations, so `storybookTestExclude` in `app/vite.config.ts` keeps them out of `pnpm run test:stories`.
- Application E2E specs in `app/e2e/app/release-management/`: `releases.create.spec.ts` (from scratch and from a base release), `release-management.errors.spec.ts` (a server error on creation), `release-status.read.spec.ts` (a replaced release reads Superseded on both lists, the catalog dialog, the releases dialog of a zone and the detail, including after a deployment replaces it, the same statuses printed in French, and a deleted release leaving the deployments list) and `workspace.read.spec.ts` (the tabs, both lists and the detail). `deployment-zones.deploy.spec.ts` covers deploying a release to a zone.

[Testing](../../../docs/06-testing/README.md) says how to choose between these kinds of test.

## Public API

`app/src/features/releases/index.ts` exports:

- components: `DeploymentsPageContent`, `ReleaseDetailDeploymentZonesTab`, `ReleaseDetailOverviewTab`, `ReleaseDetailPageContent`, `ReleaseForm`, `ReleasesPageContent` and `ReleaseTable`;
- queries: `invalidateReleaseQueries`, `releaseQueryOptions` and `releasesQueryOptions`;
- the type `Release`.

Routes are the only importers, as `@/features/releases` (see [import rules](../../../docs/AI_CONTEXT.md#import-rules)). Besides the routes under `app/src/routes/releases/`, `releasesQueryOptions` is also read by `app/src/routes/customers/instances/$instanceSlug/route.tsx`.

```tsx
// app/src/routes/releases/$releaseSlug/route.tsx
import {
  ReleaseDetailPageContent,
  releaseQueryOptions,
} from '@/features/releases';
```

The feature imports no other feature. It shares code through the public entry points of `@/domains/release-management` (the overview query, the status rules, the types and `ComponentFormDialog`) and `@/functionals/release-management` (the shell and the tabs):

```tsx
// app/src/features/releases/components/releases-page-content.tsx
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import { ReleaseManagementPageShell } from '@/functionals/release-management';
```
