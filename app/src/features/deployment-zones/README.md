# Deployment zones

A deployment zone is one place where a customer runs a release: a target the organization names and classifies itself, holding the release that runs on it now. This feature lists the zones, creates, edits and deletes them, deploys a release to a zone, and shows one zone with the other zones that run the same release. It is the third tab of the release-management workspace, next to [releases](../releases/README.md) and [components](../components/README.md).

## Routes

The layout route `app/src/routes/releases/route.tsx` preloads the releases and the zones for every URL below.

| URL | Route file | What it renders |
| --- | --- | --- |
| `/releases/deployment-zones` | `app/src/routes/releases/deployment-zones/route.tsx` | A layout: `DeploymentZonesPageContent` around an `<Outlet />` that receives the three dialogs below. The loader preloads the releases, the zones and the release overview. |
| `/releases/deployment-zones/new` | `app/src/routes/releases/deployment-zones/new/index.tsx` | `DeploymentZoneFormDialog`, over the list |
| `/releases/deployment-zones/$zoneSlug/edit` | `app/src/routes/releases/deployment-zones/$zoneSlug/edit.tsx` | `DeploymentZoneFormDialog` on the zone, over the list |
| `/releases/deployment-zones/$zoneSlug/deploy` | `app/src/routes/releases/deployment-zones/$zoneSlug/deploy.tsx` | `DeployReleaseDialog`, over the list |
| `/releases/deployment-zones/$zoneSlug` | `app/src/routes/releases/deployment-zones_/$zoneSlug/route.tsx` and `index.tsx` in the same folder | `DeploymentZoneDetailPageContent` and, in it, `DeploymentZoneDetailOverviewTab` |
| `/releases/deployment-zones/$zoneSlug/peers` | `app/src/routes/releases/deployment-zones_/$zoneSlug/peers.tsx` | `DeploymentZoneDetailPeersTab` |
| `/releases/$releaseSlug/deploy` | `app/src/routes/releases/$releaseSlug/deploy.tsx` | `DeployToZoneDialog`, over the detail page of the release |

- **Two folders for one URL space.** The trailing underscore of `deployment-zones_` takes the detail routes out of the list layout, so the detail page does not render inside the list page. The `edit` and `deploy` routes stay inside it: opened from the detail page, they show their dialog over the list, and closing or saving navigates to `/releases/deployment-zones`.
- **Unknown slug.** The `edit` and `deploy` routes look the zone up in the cached list and throw `notFound()` when the slug is not there. The detail route ensures the zone by its slug in `beforeLoad` and sets the breadcrumb title to its name.
- **Old URLs.** `/releases/deployment-zone` (singular) and `/releases/deployment-zone/$zoneSlug`, with its `/peers` page, redirect to the plural URLs (`app/src/routes/releases/deployment-zone/`).
- The dialogs follow [dialog via route](../../../docs/03-patterns/dialog-via-route.md).

## Structure

```text
app/src/features/deployment-zones/
├── components/
│   ├── deployment-zone-detail/    # provider, header and tabs of the detail page, Overview and Peers tabs
│   ├── deployment-zones/          # table, columns, filters, row actions, stats cards, form dialog and its metadata fields, releases and instances dialogs, __tests__/
│   ├── deployments/               # DeployReleaseDialog, DeployToZoneDialog, __tests__/
│   ├── stories/
│   ├── deployment-zones-page-content.tsx
│   └── index.ts
├── hooks/       # useDeploymentZoneForm, useDeleteDeploymentZoneMutation, useDeployReleaseMutation, the two dialog store hooks
├── queries/     # deploymentZonesQueryOptions, deploymentZoneQueryOptions
├── schemas/     # deploymentZoneFormSchema, __tests__/
├── store/       # TanStack Stores of the raw-JSON editor and of the release picker
├── types/
├── utils/       # write body of the form, peer and count helpers of the detail page, date format, __tests__/
├── index.ts
└── README.md
```

## Data

| Query | Source | Used for |
| --- | --- | --- |
| `deploymentZonesQueryOptions` | REST `GET /deployment-zones`, every page (`allDeploymentZonesOptions()` in `app/src/lib/api/all-pages-query-options.ts`) | the list, the dialogs, the detail page and every route that needs the zones |
| `deploymentZoneQueryOptions(slug)` | generated `getDeploymentZoneBySlugOptions`, `GET /deployment-zones/{deploymentZoneSlug}` | the detail route |
| `releaseManagementOverviewQueryOptions` | GraphQL `GetReleaseManagementOverview`, exported by `@/domains/release-management` | the releases and instances of each zone, and two stats cards |
| `allReleasesOptions()` | REST `GET /releases`, every page. `features/releases` exports the same options as `releasesQueryOptions`, which the deploy route reads. | the current release of each zone, the release picker |
| `metadataFieldsActiveQueryOptions('DEPLOYMENT_ZONE')` | GraphQL, through `@/domains/metadata-fields` | the typed metadata columns, filters and form fields |

The metadata fields are read with `useQuery`, not `useSuspenseQuery`: a failed or refused request reads as "no field declared", and the table and the form fall back to raw JSON.

`buildDeploymentZoneRelations` (`@/domains/release-management`) turns the overview into the releases and instances of each zone. The overview is history, not state: a release lists every zone it was ever deployed to, and its instances are those on such zones. The releases and instances columns therefore cover only zones that received at least one release: an instance placed on a zone that never ran a release is not listed on it.

Writes:

- `createDeploymentZoneMutation` and `updateDeploymentZoneMutation`, called by `useDeploymentZoneForm`.
- `updateDeploymentZoneMutation` again, called by `useDeployReleaseMutation`: a deployment is an update of the zone.
- `deleteDeploymentZoneMutation`, wrapped by `useDeleteDeploymentZoneMutation`.

Each of these writes invalidates `listDeploymentZonesQueryKey()` and `releaseManagementOverviewBaseQueryKey`; the list options keep the key of the generated first-page options, so one invalidation reaches every screen. Create, edit and deploy await the invalidation before the dialog closes. None of them invalidates the zone's own detail query, so a cached detail is refetched only once it is older than the 30-second `staleTime` of the query client (`app/src/main.tsx`). See [query key invalidation](../../../docs/02-conventions/query-key-invalidation.md).

## Behaviour

### List

- **Cards.** Total Zones, Production Zones, Total Instances and Total Deployments. A zone counts as production when its type is anything but `staging` or `development`. The last two come from the overview: distinct instances across zones, and distinct release and zone pairs ever recorded.
- **Columns.** Name (sortable, with the zone icon), Type (badge), the metadata, Current Release ("Not deployed" when none), Releases, Instances, Created and Updated (sortable; Updated reads "-" for a zone never edited) and an Actions column. Releases and Instances show a count that opens a dialog: the releases the zone ever ran with their status, or its instances with their customer.
- **Metadata columns.** With no active field, one raw-JSON dialog column. With active fields, one typed column per field and, only when some zone holds keys no active field covers, an "Extra metadata" column (see [metadata fields](../../functionals/metadata-fields/README.md)).
- **Filters.** Name (the search box), Type, Current Release (with a "Not deployed" value), Updated, and either a Metadata yes/no filter or one typed filter per active field. They run on the client. See [`functionals/table`](../../functionals/table/README.md) and [`functionals/filters`](../../functionals/filters/README.md).
- **Actions.** A row opens the detail page. Edit and Deploy navigate to their routes, and Deploy is disabled while no release exists. Delete asks for confirmation. "Create Deployment Zone" goes to `/releases/deployment-zones/new`, and "Configure metadata fields" to `/settings/metadata` for the `DEPLOYMENT_ZONE` resource type.
- **Empty state.** The table reads "No results".

### Zone type

The type is free-form. The console labels `production`, `staging` and `development` (`ZONE_TYPE_DEFAULTS` in `app/src/domains/release-management/logic/deployment-zone-presentation.ts`) and shows any other type as typed. The form suggests those three, then every type the organization already uses, and accepts a new value. A new zone starts on `development`. The badge is the accent for `production`, secondary for `staging` and outline for the others. The same module says which types count as production, and `getReleaseOverviewStatus` applies that rule to a release.

### Create and edit

- **Form.** Name, Slug, Type, Description and Metadata. Name, Type and Description are required. On creation the slug follows the name, can be edited, and an empty slug is left out so that the API generates one. On edition the slug is never sent, and neither is `releaseId`: a zone changes release through the deploy dialogs only.
- **Metadata.** With active fields the form shows one typed input per field, checked in strict mode. Only the values of active fields are sent. The API keeps the values of archived fields itself and rejects keys it does not know. A warning under the fields lists the stored keys that no active field covers, archived or unknown, and the request leaves them out. With no active field, the form shows a card that links to the metadata settings and offers "Edit as JSON"; a zone that already has metadata opens the JSON editor directly. Invalid JSON shows "Invalid JSON format" under the editor, and the form keeps the last valid value.
- **After a save.** A toast reads "Deployment zone created successfully" or "Deployment zone updated successfully" and the console returns to the list. A failed save shows a toast with the API message and keeps the dialog open.

### Deploy

There are two dialogs and one mutation. `DeployReleaseDialog` starts from a zone and picks a release. `DeployToZoneDialog` starts from a release and picks a zone. Both send a `PUT` on the zone, since there is no dedicated deploy endpoint:

```ts
// app/src/features/deployment-zones/components/deployments/deploy-release-dialog.tsx
await updateMutation.mutateAsync({
  path: { deploymentZoneSlug: deploymentZone.slug! },
  body: {
    name: deploymentZone.name,
    type: deploymentZone.type,
    description: deploymentZone.description,
    metadata: deploymentZone.metadata,
    releaseId: selectedReleaseId,
  },
});
```

- **API.** The API records a deployment when `releaseId` differs from the current one, including a return to a release the zone already ran. A `releaseId` that is omitted or unchanged records nothing.
- **Pickers.** `DeployReleaseDialog` opens on the release the zone runs, or on nothing, and lists every release by its version, followed by its description when it has one. Deploy stays disabled until the selection differs from the current release. `DeployToZoneDialog` lists the zones by name, says "This zone already runs <version>." and disables Deploy for a zone that already runs the release.
- **No undeploy.** The console cannot take a zone off its release. `releaseId` is an optional `*uuid.UUID` on the update command, so an omitted field and an explicit `null` both decode to nil and both mean "keep the current release" (`patchutil.ResolveOptional` in `api/internal/modules/deploymentzones/updatedeploymentzone/handler.go`). The zone's current release is its latest deployment row, and the `release_id` of a deployment row is `NOT NULL`, so no request can record "no release". Undeploying needs a new API operation.
- **After a deployment.** The dialog closes, a toast reads "Release deployed successfully" and the console tracks a `release_deployed` event (`logger.track`) with the zone name, the zone slug and the release id. The console then returns to the list, or to the release detail page for `DeployToZoneDialog`.

### Delete

The table row and the detail header both ask for confirmation. The mutation removes the zone from the cached list at once, puts it back and shows the toast "Failed to delete deployment zone" when the request fails, and "Deployment zone deleted successfully" otherwise. The detail page then navigates to the list. The console does not check for releases or instances first: the database sets the `deployment_zone_id` of the zone's instances to null, so they read as not deployed, and removes the zone's deployment history.

### Detail

- **Header.** The name, the type badge, a Deployed or Not deployed badge (deployed when the zone has a `releaseId`) and the description ("No description provided." when empty). The actions are Edit, Deploy and Delete; the first two are links to the dialog routes above.
- **Cards.** Type, Current release, Metadata keys (the number of keys) and Zones sharing current release (the zone itself included).
- **Overview tab.** General Information (name, type, slug, id, description, created and updated stamps with their author) and Current Release (a link to `/releases/$releaseSlug` when the release has a slug, or "Not deployed"). The Current Release card also shows the zone's metadata as raw JSON, or "No features metadata configured for this zone."
- **Peers tab.** The other zones whose current release is the same, in a table (name, type, updated, a link to the zone) without pagination. A zone with no release shows "No Peers", and a release with no other zone "No other deployment zones share this release."

[Detail cards](../../../docs/03-patterns/detail-cards.md) and [stats cards](../../../docs/03-patterns/stats-cards.md) describe the shared patterns.

## Tests

- Unit tests (Vitest), next to the code in `__tests__/` folders: `components/deployment-zones/__tests__/deployment-zone-form-dialog.test.tsx` (typed metadata sanitizing, the stacked shell, the dynamic form) and `deployment-zone-table-filters.test.ts` (the metadata filters), `components/deployment-zones/__tests__/deployment-zone-releases-display.test.tsx` (the releases dialog of a zone: a superseded release reads Superseded, each status reads in English and in French, a release the overview lacks reads a dash), `components/deployments/__tests__/deploy-release-dialog.test.tsx` (the disabled Deploy button, and a list that holds the releases and no "none" entry), `schemas/__tests__/deployment-zone.schema.test.ts`, and under `utils/__tests__/` the write body, the detail helpers, and the type and date helpers.
- Stories in `components/stories/`: `Features/Releases/DeploymentZoneTable`, `Features/Releases/DeploymentZoneFormDialog` and `Features/Releases/DeployReleaseDialog`. They need the router and mutations, so `storybookTestExclude` in `app/vite.config.ts` keeps all three out of `pnpm run test:stories`. `features-dialog.stories.tsx` documents `TableJsonDialog` (`Functionals/Table/TableJsonDialog`), not this feature.
- Application E2E specs in `app/e2e/app/release-management/`: `deployment-zones.update.spec.ts` (the edit dialog, the release the zone keeps after a save, and the redirect from the singular URL), `deployment-zones.deploy.spec.ts` (deploying a release, the tracked event and the detail page, and the release list with no undeploy entry) and `workspace.read.spec.ts` (the tabs, the list, the detail and Peers tab). `app/e2e/app/release-management/release-status.read.spec.ts` opens the releases dialog of a zone and checks that a replaced release reads Superseded, in English and in French. `app/e2e/app/instances/instances.deploy.spec.ts` covers the instance side. No spec creates or deletes a zone.
- The release-status and zone-type rules are tested in the domain: `app/src/domains/release-management/logic/__tests__/`.

[Testing](../../../docs/06-testing/README.md) says how to choose between these kinds of test.

## Public API

`app/src/features/deployment-zones/index.ts` exports:

- components: `DeploymentZoneDetailOverviewTab`, `DeploymentZoneDetailPageContent`, `DeploymentZoneDetailPeersTab`, `DeploymentZoneFormDialog`, `DeploymentZoneStatsCards`, `DeploymentZonesPageContent`, `DeploymentZoneTable`, `DeployReleaseDialog` and `DeployToZoneDialog`;
- queries: `deploymentZoneQueryOptions` and `deploymentZonesQueryOptions`;
- the type `DeploymentZone`.

Routes are the only importers (see [import rules](../../../docs/AI_CONTEXT.md#import-rules)): the routes under `app/src/routes/releases/` use the pages, dialogs and tabs, and `deploymentZonesQueryOptions` is also preloaded by `app/src/routes/customers/instances/$instanceSlug/route.tsx`. `DeploymentZoneStatsCards`, `DeploymentZoneTable` and the type `DeploymentZone` have no importer outside the feature.

The feature imports no other feature. It shares code through `@/domains/release-management` (the overview, the relations, the zone type and release status rules), `@/domains/metadata-fields` and `@/functionals/release-management` (the page shell, which carries the workspace tabs).
