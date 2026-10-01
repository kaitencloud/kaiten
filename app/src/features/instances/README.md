# Instances

An instance is a customer's use of a license: it belongs to one customer, is pinned to one license version for a period, and can be placed on a deployment zone. This feature lists the instances, creates, edits and deletes them, deploys or migrates one to a zone, and shows one instance with its details, its entitlements and usage, and its audit trail. The list is the Instances tab of the customers section, next to [customers](../customers/README.md).

## Routes

| URL | Route file | What it renders |
| --- | --- | --- |
| `/customers/instances` | `app/src/routes/customers/instances/index.tsx` | `InstancesPageContent`: the instances table under a Customers / Instances tab bar |
| `/customers/instances/new` | `app/src/routes/customers/instances/new/index.tsx` | The same page with `InstanceFormDialog` open. A created instance opens on its detail page (the list if the response has no slug). |
| `/customers/$customerSlug/instances/new` | `app/src/routes/customers/$customerSlug/instances/new/index.tsx` | `InstanceFormDialog` with the customer locked, over the customer's page. A created instance opens on its detail page. |
| `/customers/instances/$instanceSlug` | `app/src/routes/customers/instances/$instanceSlug/route.tsx` and `index.tsx` in the same folder | `InstanceDetailProvider` and `InstanceDetailLayout`, and in them `InstanceDetailOverviewTab`. With `?mode=configure` it also opens `InstanceFormDialog` on the instance. |
| `/customers/instances/$instanceSlug/entitlements` | `app/src/routes/customers/instances/$instanceSlug/entitlements.tsx` | `InstanceDetailEntitlementsTab` |
| `/customers/instances/$instanceSlug/audit-trail` | `app/src/routes/customers/instances/$instanceSlug/audit-trail.tsx` | `InstanceDetailAuditTrailTab` |
| `/customers/instances/$instanceSlug/edit` | `app/src/routes/customers/instances/$instanceSlug/edit.tsx` | Redirects to `/customers/instances/$instanceSlug?mode=configure` |

- **Layouts.** `app/src/routes/customers/route.tsx` preloads `customersWithInstancesQueryOptions` (the customers with their instances) for the whole `/customers` section, and `app/src/routes/customers/instances/route.tsx` only renders the outlet. The instances list itself is not preloaded.
- **Detail loader.** `beforeLoad` ensures the instance and sets the breadcrumb title to its name. The loader then calls `ensureInstanceDetailData` (the instance, then its customer, license, usage and license entitlements), and preloads the deployment zones, the release overview and the releases.
- **Dialogs.** They follow [dialog via route](../../../docs/03-patterns/dialog-via-route.md). `?mode=configure` is validated by the route's search schema, and closing the dialog or saving returns to the detail page without it.

## Structure

```text
app/src/features/instances/
├── components/
│   ├── instance-detail/
│   │   ├── instance-detail-context.tsx   # InstanceDetailProvider, useInstanceDetail
│   │   ├── instance-detail-layout.tsx    # header, cards and tab bar
│   │   ├── entitlement-group-filter-select.tsx
│   │   └── tabs/
│   │       ├── overview/                 # the tab and its cards/
│   │       ├── entitlements/             # the tab and its columns
│   │       └── audit-trail/              # the tab, the charts, the event log, helpers
│   ├── instance-deployment/              # deploy and migrate: button, table action, dialog
│   ├── instance-form/                    # dialog, multi-step form, steps, sections, footers
│   ├── instance-table.tsx, instance-table-columns.tsx, instance-table-actions.tsx
│   ├── instance-status-editor.tsx        # status popover of the detail header
│   ├── instances-page-content.tsx
│   ├── __tests__/, stories/
│   └── index.ts
├── hooks/
│   ├── instance-detail/                  # query options, ensureInstanceDetailData, data, derived state, mutations
│   ├── use-instance-detail-view-model.ts # assembles the three hooks above
│   ├── use-instance-deployment-mutation.ts
│   └── instance-query-invalidation.ts    # re-exports the helpers of the customer-management domain
├── types/
├── utils/                                # form schemas and write bodies, deployment, license options, detail and entitlement helpers
└── index.ts
```

## Data

| Screen | Reads |
| --- | --- |
| List | `useInstancesWithRelations()` from `@/domains/customer-management`: GraphQL `GetInstancesWithRelations`, every page. Also `metadataFieldsActiveQueryOptions('INSTANCE')` (GraphQL, `@/domains/metadata-fields`), read with `useQuery` so that a failed request reads as "no field declared". |
| Detail | `instanceQueryOptions(instanceSlug)` (`GET /instances/{instanceSlug}`), then the customer, the license, the usage (`getEntitlementsUsageMetricsOptions`, `GET /instances/{instanceSlug}/entitlements/usage`), the license entitlements and the entitlement catalog, the deployment zones, the release overview and the releases. `useInstanceDetailData` reads them all with `useSuspenseQuery`. The options for the instance, customer, license, usage and entitlements are in `hooks/instance-detail/instance-detail-query-options.ts`. |
| Audit trail tab | `getAuditTrailsOptions` (`GET /instances/{instanceSlug}/audit-trails`) with `limit: 200`, refetched every 30 seconds. |
| Form | `allCustomersOptions()` (skipped when the customer is locked), `allLicensesOptions()` and `allDeploymentZonesOptions()` from `app/src/lib/api/all-pages-query-options.ts`, and the active instance metadata fields. |

`InstanceDetailProvider` runs `useInstanceDetailViewModel`, which combines `useInstanceDetailData`, `useInstanceDetailDerivedState` and `useInstanceDetailMutations`, and puts the result in context. The tabs read it with `useInstanceDetail()`.

Writes:

- `createInstanceMutation`, `updateInstanceMutation` and `patchInstanceMutation`, called by `InstanceForm`. The lifecycle stage is a PATCH, sent after the create or the update when it is not empty and has changed.
- `updateInstanceMutation` and `patchInstanceMutation` again, from `useInstanceDetailMutations`: renaming the instance in the header (a PUT with the current values) and changing its status (a PATCH).
- `updateInstanceMutation`, from `useInstanceDeploymentMutation`: deploying or migrating.
- `deleteInstanceMutation`, from the table row action and from `useInstanceDetailMutations`.

Invalidation goes through `@/domains/customer-management` (`invalidateInstancesListQueries`, `invalidateInstanceQueries`, `forgetDeletedInstanceQueries`). They cover the REST instance list, the GraphQL list, the customer queries that derive from instances and, for one instance, its detail. See [query key invalidation](../../../docs/02-conventions/query-key-invalidation.md). Three details:

- After a create, the form stores the created instance under its detail key before the route opens it, so the detail route reads it instead of fetching it.
- After a delete, the detail query is removed, not invalidated: the API hard-deletes the row, and refetching it would fail and retry. The detail page navigates to `/customers/instances` first and reconciles the cache afterwards, because it observes the instance through `useSuspenseQuery`. The table row action does both at once, as nothing observes the row's detail.
- A deployment also invalidates the deployment zone list and the release overview.

## Behaviour

### List

- **Columns.** Name, Customer, CRM Sync, License, Status and Lifecycle (all sortable except CRM Sync), the metadata, and an Actions column. With no active metadata field, the metadata is one raw-JSON dialog column. With active fields, there is one typed column per field and, only when some instance holds keys no active field covers, an "Extra metadata" column. See [metadata fields](../../functionals/metadata-fields/README.md).
- **Filters.** Name (the search box), Description, Customer, License, Status, Lifecycle, and one typed filter per active metadata field. They run on the client. See [`functionals/table`](../../functionals/table/README.md) and [`functionals/filters`](../../functionals/filters/README.md).
- **Actions.** A row opens the detail page. The row actions are Deploy (or Migrate, for an instance that has a zone) and Delete; there is no edit action, which is on the detail page. "New Instance" goes to `/customers/instances/new`, and "Configure metadata fields" to `/settings/metadata` for the `INSTANCE` resource type.
- **Status and lifecycle.** The status is one of Healthy, Degraded, Incident and Maintenance, and reads Healthy when the API sends none. The lifecycle stage is free-form. The console labels Trial, Active, At risk and Churned and shows any other stage as typed. Both come from `@/domains/customer-management`, which the customers screens share.

### Create and edit

`InstanceFormDialog` is a stepped form. The steps are:

1. **Instance information.** Name (at least 3 characters), Slug (creation only), Description, Customer and Lifecycle stage. On creation the slug follows the name and can be edited, and an empty slug is left out so that the API generates one. The customer is locked when the dialog comes from a customer page. The lifecycle stage is a combobox that suggests the four labelled stages and accepts any value; it can be emptied on creation only.
2. **License.** The license version and the license period, which starts today and ends a year later by default. The picker offers every version but the archived ones, plus the instance's own version when it is archived. Options read `<name> v<version>`, with "(draft)" or "(archived)" added. The API refuses to assign an archived version and accepts a draft. The console shows no slug, so two products that share a name read alike.
3. **Deployment.** The deployment zone, optional. It can be emptied while the instance has no zone. Once the instance has one, it can be switched to another zone but not emptied: the API reads an omitted zone as "keep the current one". Switching from this step is a migration, like the Migrate action.
4. **Metadata.** Only when the organization declares active instance metadata fields: one typed input per field. When there is none, the Deployment step is the last and carries the submit button.

On the first two steps, Next stays disabled until the step is valid. Instance metadata is tolerant: the API accepts keys that no active field declares and keeps the values of archived fields itself, but the PUT replaces the metadata as a whole. The metadata step therefore folds the undeclared keys back into the form value on every change, so that saving never drops them. A failed save shows a toast with the API message. After a save, a toast reads "Instance created successfully" or "Instance updated successfully".

### Detail

- **Header.** The instance name, editable in place (at least 3 characters); the status badge, which opens a list of the four statuses and applies the pick at once, with a toast that offers to put the previous status back; and the customer and license names. The actions are Edit (`?mode=configure`) and Delete.
- **Cards.** License Expires (the end date and the time left, in red at 30 days or fewer, in amber at 90 or fewer, and "Expired" once past), Entitlements (the count still under their limit over the total) and Usage Alerts. Usage Alerts carries two figures that count what the table's status badges show: near limit, in amber, for the number entitlements at 80% or more of their maximum allowed usage or into the overage a soft limit tolerates (`NEAR_LIMIT`, `IN_ALLOWANCE`); limit reached, in red, for the ones at that maximum or past it (`AT_LIMIT`, `OVER_LIMIT`). A figure at zero stays neutral. When any near-limit entitlement resets with its current usage window, a helper says how many. Each card's first line starts at the top of the row, even beside a date that wraps on a narrow screen, and its second line (a helper, or the second figure) sits on one baseline at the bottom.
- **Overview tab.** From `xl` the cards sit in three columns: Instance details (name, description, customer, lifecycle stage, created and updated stamps with their author) above the Attio Synchronization card; License (plan, linking to `/licenses/$licenseSlug`, type, version and the period with a progress bar) above Metadata; and Release. The Attio card comes from `@/domains/crm-sync` and renders only when the instance is linked to a CRM record or a sync is in progress. [Detail cards](../../../docs/03-patterns/detail-cards.md) describes the pattern.
- **Metadata card.** One row per active field, rendered by `renderMetadataValue`, the helper the table columns use, so a value reads the same in both. Undeclared keys and values of archived fields sit behind a raw-JSON dialog. With no active field the card shows an empty state.
- **Release card.** The release is resolved from the instance's zone: `instance.deploymentZoneId`, then the zone's current `releaseId`, then that release. The card shows the version and the zone (each a link), the release status as a badge, and when and by whom it was deployed, which is the last update of the zone. The status is the one the releases pages show, from `getReleaseOverviewStatus` over the release of the overview. A release the overview does not hold yet reads from its zone alone: Deployed on a production zone, Staging on a staging or development one. A zone without a release still counts as a deployment: the card reads "Unknown" for the missing parts. An instance without a zone shows an empty state with the Deploy button.
- **Entitlements tab** ("Entitlements & Usage"). The rows are the entitlements granted by the license, matched to the instance's usage; usage that has no grant behind it is added as a number entitlement. A group filter narrows the usage card and the table. The tab has no cards of its own: the header's carry the counts. The Usage Overview card draws one meter per number entitlement with its usage window, or "Lifetime" for a counter that never resets, and a soft limit shows its overage allowance. The table has Entitlement (a link to `/entitlements/$entitlementSlug`), Type, Usage (right-aligned, so the meters line up), Threshold, Current window and Status. An entitlement counts as enabled until it reaches its maximum allowed usage, which only a number entitlement can.
- **Audit trail tab.** It reads the last 200 events of the instance, newest first, and refreshes every 30 seconds. Six cards, in a dense row, count the events: Total Events, Reads, Accepted, Rejected, Warnings and Today. An activity timeline charts them per day, by status (with its own entitlement group and entitlement filters) or by entitlement group. A Value Over Time chart follows the value of a number entitlement, or the total of a group's lifetime counters; it is hidden when the instance has no number entitlement. The event log below has a search box and group, event and status filters, five rows per page, a highlight on rejected events, and a button that opens a dialog with the event, its entitlement and its full JSON payload. A "How Audit Trail Works" card closes the tab. The search box and the three filters act on the event log only; the cards read every event and the charts have their own controls. The status comes from `getEventCategory` in `@/domains/audit-trail`, the function the global [audit trail](../audit-trail/README.md) page uses, so an event has one status on both: read, accepted, rejected or warning. The three usage events that say a limit is approaching, at or past (`INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED`, `INSTANCE_ENTITLEMENT_USAGE_REACHED` and `INSTANCE_ENTITLEMENT_CAP_EXCEEDED`) are warnings: they count on the Warnings card, carry the warning badge, are what the Warning status filter keeps and draw their own series in the activity timeline. `ENTITLEMENT_USAGE_REPORT_ACCEPTED` is accepted, `ENTITLEMENT_USAGE_REPORT_REJECTED` is rejected, and an event the domain does not name reads from its last word (see the audit trail README). Event labels come from `resolveEventLabel` in the same domain.

### Deploy and migrate

One control covers the two transitions. An instance without a zone is *deployed*, one that has a zone is *migrated*, and both open the same picker. The control is an icon in the list row, and a button on the Release card of the detail page: a header action once the instance has a zone, the main button of the empty state before.

- **Dialog.** It opens with the instance and the zones fetched, shows the current zone when migrating, and lists the other zones as `<name> — <type>`. It says so when there is no other zone, and confirms only once a zone is chosen.
- **No dedicated endpoint.** Deploying and migrating are a `PUT /instances/{slug}` with a new `deploymentZoneId`. The PUT replaces the whole resource, so the dialog fetches the instance and re-sends every writable field:

```ts
// app/src/features/instances/utils/instance-deployment.utils.ts
export const instanceToDeploymentUpdateInput = (
  instance: Instance,
  deploymentZoneId: string,
): InstanceWritable => ({
  customerId: instance.customerId,
  deploymentZoneId,
  description: instance.description,
  endLicenseDate: instance.endLicenseDate,
  licenseId: instance.licenseId,
  metadata: instance.metadata ?? {},
  name: instance.name,
  startLicenseDate: instance.startLicenseDate,
});
```

- **Events.** The API infers the transition from the previous zone and emits `INSTANCE_DEPLOYED` or `INSTANCE_MIGRATED` (`api/internal/modules/instances/updateinstance/handler.go`).
- **After a deployment.** The dialog closes, a toast reads "Instance deployed successfully" or "Instance migrated successfully", and the console tracks `instance_deployed` or `instance_migrated` (`logger.track`) with the instance slug and the previous and the new zone.

### Delete

The row action and the detail header both ask for confirmation, and the text warns that usage history, reported metrics and integration links go with the instance: the API deletes the row for good. A successful delete shows the toast "Instance deleted successfully" and a failed one "Failed to delete item". After a delete from the detail page the console returns to `/customers/instances`.

## Tests

- Unit and component tests (Vitest), next to the code: `components/__tests__/` (the table's metadata columns, the status editor), `components/instance-form/instance-form.test.tsx` (the lifecycle stage on update, the locked customer), `hooks/instance-query-invalidation.test.ts`, `hooks/instance-detail/__tests__/use-instance-detail-mutations.test.ts` (the status toast and its undo), `hooks/instance-detail/__tests__/use-instance-detail-derived-state.test.ts` (the release status of the Release card), `components/instance-detail/tabs/overview/cards/__tests__/release-card.test.tsx` (the Release card prints each status in English and in French), `utils/__tests__/` (form bodies, deployment, license options, entitlement rows and metrics), and, for the detail tabs, `tabs/entitlements/__tests__/` and `tabs/audit-trail/__tests__/` (the charts, the filters, the helpers, and `audit-trail-status.test.tsx`: the three usage events read as warnings in the filter, the timelines and the Warnings card). The route of the customer-scoped dialog has `app/src/routes/customers/$customerSlug/instances/new/-index.test.tsx`.
- Stories in `components/stories/`: `Features/Instances/InstanceTable`, `Features/Instances/InstanceFormDialog` and `Features/Instances/OverviewAndAudit`. The last two need the router and mutations, so `storybookTestExclude` in `app/vite.config.ts` keeps them out of `pnpm run test:stories`.
- Application E2E specs in `app/e2e/app/instances/` (`instances.<name>.spec.ts`): `read`, `create`, `update`, `delete`, `deploy`, `metadata` and `errors`, with their data in `instances.scenarios.ts`. `deploy` covers the list action, the Release card, and the zone step of the create and edit forms. `app/e2e/app/accessibility/accessibility.spec.ts` runs WCAG checks on the list.
- The status, lifecycle and invalidation code is tested in the domain: `app/src/domains/customer-management/`.

[Testing](../../../docs/06-testing/README.md) says how to choose between these kinds of test.

## Public API

`app/src/features/instances/index.ts` exports `InstanceDetailAuditTrailTab`, `InstanceDetailEntitlementsTab`, `InstanceDetailLayout`, `InstanceDetailOverviewTab`, `InstanceDetailProvider`, `InstanceFormDialog`, `InstancesPageContent`, `ensureInstanceDetailData` and `instanceQueryOptions`. The routes under `app/src/routes/customers/` import all of them, and no other code does (see [import rules](../../../docs/AI_CONTEXT.md#import-rules)): the customers section opens the create dialog from its own routes.

The feature imports no other feature. It shares code through `@/domains/customer-management` (the instance list, status, lifecycle and invalidation), `@/domains/release-management`, `@/domains/audit-trail`, `@/domains/entitlement-usage`, `@/domains/crm-sync` and `@/domains/metadata-fields`. It does not import the customers feature: `hooks/instance-detail/instance-detail-query-options.ts` defines its own `customerQueryOptions` over the generated `getCustomerOptions`.
