# Settings

The settings page is the entry to what an administrator configures. It links to the organization's settings pages and holds the settings the browser remembers (language, side navigation). The metadata fields page lets an administrator declare typed fields for deployment zones and instances: create, edit, duplicate, archive and reorder them. Where billing is on, the billing page says who collects the invoices and where Stripe stands, counts what needs attention in billing, sets the defaults a subscription takes and shows how long usage is kept, and the settings page offers the organization's data as files to keep before it is deleted.

## Routes

| Path | Route file | What it renders |
| --- | --- | --- |
| `/settings` | `app/src/routes/settings/index.tsx` | `SettingsPageContent` |
| `/settings/metadata` | `app/src/routes/settings/metadata.tsx` | `MetadataFieldsPageContent` |
| `/settings/billing` | `app/src/routes/settings/billing.tsx` | `BillingSettingsPageContent`. Guarded by `requireBillingCapability`: where billing is off the route explains itself (`BillingNotFound`) and the settings page does not link to it. |
| `/settings/notifications` | `app/src/routes/settings/notifications.tsx` | The preferences page of the `notifications` feature (`app/src/features/notifications/`), which this folder does not own |

`/settings` is pinned to the bottom of the side navigation, below the audit trail (`footerRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`).

`/settings/metadata` takes a `resourceType` search parameter, `DEPLOYMENT_ZONE` or `INSTANCE`. Any other value reads as `DEPLOYMENT_ZONE`. Switching the tab navigates with `replace`, so the tab does not fill the history. The route has no loader: the page shows placeholder rows while the fields load.

`SettingsPageContent` takes `children`, which it appends after its own sections. The route uses this to add the card of the `demo-sandbox` feature when `useDemoSandboxEnabled()` is true: a feature may not import another feature, so the route composes them.

The audit trail is not a setting; it has its own entry and its own feature, [`audit-trail`](../audit-trail/README.md). [`service-accounts`](../service-accounts/README.md), `webhooks` and `connectors` live under `/integrations/*`.

## Structure

```txt
app/src/features/settings/
├── components/
│   ├── settings-page-content.tsx        # the /settings page: two groups of settings, then children
│   ├── settings-link-card.tsx           # a card with a title, a blurb and a button to a settings page
│   ├── billing-settings-link-card.tsx   # the card that leads to /settings/billing: absent where billing is
│   ├── application-settings-section.tsx # language, side navigation state, reset
│   ├── __tests__/, stories/
│   └── index.ts
├── billing/                             # the /settings/billing page
│   ├── components/                      # the providers (with the sync line of Stripe), the health (and its tiles), the defaults (and their fields) and the retention cards
│   ├── hooks/                           # use-update-billing-settings, use-sync-billing
│   ├── utils/                           # what the health counts and where it leads, the sync state of a provider, how a pass of the providers went
│   └── schemas/                         # the form of the defaults, and where each refusal of the API is shown
├── data-export/                         # the card of the /settings page that offers the data to keep
│   ├── components/                      # ExportDataCard, UsageExport (the months)
│   ├── hooks/, queries/, utils/         # the export of a month, its download, the chunks of months
├── metadata-fields/                     # the /settings/metadata page
│   ├── components/                      # rows, list, form fields, dialogs, states, JSON editor
│   ├── schemas/                         # form schema, validation, JSON Schema mapping
│   ├── metadata-fields-page-content.tsx
│   ├── use-metadata-fields-page.ts      # page state: dialogs, dry run, reorder
│   ├── use-metadata-field-mutations.ts  # the five mutations and their invalidation
│   ├── use-metadata-field-form.ts       # the create, edit and duplicate form
│   ├── metadata-fields.queries.ts       # query options of the page
│   ├── metadata-fields.diff.ts          # schema comparison, ordering helpers
│   ├── metadata-field-helpers.ts        # dialog state, labels, error helpers
│   ├── __tests__/, types/
│   └── index.ts
└── index.ts
```

The read model shared with other screens lives outside this feature. `app/src/domains/metadata-fields/` holds the list query and its types, which the `deployment-zones` and `instances` features read too. `app/src/functionals/metadata-fields/` turns a field list into table columns, filters and form inputs; see [`functionals/metadata-fields`](../../functionals/metadata-fields/README.md).

Base form schemas import the domain contracts directly. Inferred form types
reference `schemas/metadata-fields.schema.ts`, not the schema barrel that also
exports context validation and diff helpers; dependency direction stays acyclic.

## Data

The `/settings` page reads no server data of its own: the card that leads to the billing settings and the card of the export of the data read the capabilities of billing and the scopes of the session, and the months the export lists come from the retention the capabilities tell. Its browser settings come from `useAppSettings` (`app/src/hooks/use-app-settings.ts`), a live query over `app/src/lib/settings/`: a TanStack DB collection persisted in `localStorage` under `kaiten:app-settings`, holding `language`, `theme` and `sideNavExpanded`.

The billing page reads and writes as follows:

- **Read.** `billingSettingsQueryOptions` (`GET /billing/settings`, from `@/domains/billing`) for the defaults, in the page, so that a refusal shows in its card with a way to ask again and the other cards stay. The providers and the retention come from `useBillingCapabilities`; the health (`billingHealthQueryOptions`, `GET /billing/health`) is read by its card and by the Stripe row of the providers card, which share the read, and only for a session that may read billing.
- **Write.** `updateBillingSettingsMutation` (`PUT /billing/settings`), which replaces the three members together, so the form holds all three whether or not it shows them. `invalidateBillingSettingsQueries` refreshes the defaults, and the form opens again on what the API kept. "Sync now" is `syncBillingProviderMutation` (`POST /billing/sync`, answered 202 with what each provider did): it is not optimistic, says what the pass did in a toast, and `invalidateProviderSyncQueries` refreshes the invoices, the invoice pages, the subscriptions, what each customer holds in the provider and the health.

The export of the data reads and writes nothing in the cache. `downloadUsageChunk` calls `GET /usage/reports/export` for one calendar month (the API reads 31 days at most in one export), and the invoices go through `ExportInvoicesMenu` from `@/domains/billing` with no filter. The console names the files, since a browser cannot read the name the API proposes from the local stack.

The metadata fields page reads and writes as follows:

- **Read.** `metadataFieldsSettingsQueryOptions(resourceType)` calls `fetchMetadataFields(resourceType, true)` from `@/domains/metadata-fields`. That runs the GraphQL query `MetadataFields` (`metadataFields(resourceType, includeArchived, limit, cursor)`), walks the pages (200 rows each) and sorts by display order, then label, then key. The page asks for archived fields too, so its key is `['settings', 'metadata-fields', resourceType, 'includeArchived:true']`.
- **Write.** The generated REST mutations `createMetadataFieldMutation`, `updateMetadataFieldMutation`, `archiveMetadataFieldMutation`, `unarchiveMetadataFieldMutation` and `reorderMetadataFieldsMutation`.
- **Impact preview.** The SDK function `dryRunMetadataField` (`POST /metadata-fields/{id}/dry-run`).
- **Invalidation.** After every mutation, the page's key and `metadataFieldsActiveQueryKey(resourceType)` (`['metadata-fields', resourceType, 'includeArchived:false']`), which the screens that show the fields read, so a change reaches them at once.

## Behaviour

- **Browser settings.** The language select offers English and French; a change is stored and applied at once. The card states whether the side navigation is expanded or collapsed. "Reset local settings" asks for confirmation, then restores the defaults (English, dark theme, expanded side navigation) on this device.
- **Billing providers.** NoOp is always there and has nothing to connect: the card says that the organization collects its invoices itself, through the handoff queue, with a link to it for a session that may read it. Stripe is listed whenever the API lists it, with where it stands: connected (to a test or a live account), free to be connected, or unable to be, with the reason (the plan leaves it out, the deployment has no Vault). A link leads to the page of its connector, for a session that may read the settings of the organization. Where it is connected the row also says how the last pass of Stripe went, from the sync state of the health: when it ran, or a warning when the passes keep failing or left invoices, with the last error. The health keeps when the last pass ran and not when one last succeeded, so a failing sync says when the last attempt was. The card reads the providers and never the three feature flags of the capabilities (`stripe`, `chargeAutomatically`, `publicSurface`), which the API fixes whatever Stripe can do here.
- **Health.** What needs a person's attention, counted when the page is read: held invoices (with the checks that held them), pushes that keep failing, overdue invoices, invoices waiting for the accounting system, amounts that differ in the provider over the last 30 days, periods that did not close and subscriptions past due. Each count is a figure; the first three are also links to the list of invoices opened on the matching filter (`?held=true`, `?status=PUSH_FAILED`, `?overdue=true`), the fourth leads to the handoff queue, which is the view of what waits for the accounting system, and the others have nothing to lead to (no filter lists the invoices whose provider disagrees, and a period or a subscription is not an invoice). A zero is muted and leads nowhere; when every count is zero the card says all is clear in one line. "Sync now" is in the header where a provider is connected and the session may write billing; a refusal (nothing connected, the provider unreachable) shows above the figures with a way to ask again. A session that may not read billing does not see the card.
- **Defaults for subscriptions.** The collection method, the payment terms in days (0 to 365, held to a year as it is typed and refused empty before anything is sent) and, once Stripe can be used here (connected, or free to be), whether its invoices also enter the handoff queue. A subscription that names no terms of its own takes them, from the invoices issued from the save on: an invoice already issued keeps the terms it was issued with, which the card says. Charging automatically is listed and cannot be chosen as a default, since the API refuses any default but sending the invoice in this release; the reason is on the option, and where a connected provider charges by itself (`capabilities.automaticCollection` of its entry) it points to the contract, where that method can be chosen. A session that may read the defaults and not change them sees them with a notice and no Save. A refusal shows on its field when it is about one (and goes when the field changes), above the button otherwise, with what was typed kept.
- **Usage retention.** How long the usage reports behind the invoices are kept, and how long a report sent again with the same transaction id is ignored: what the deployment says of itself, nothing to edit.
- **Export of the data.** Deleting an organization erases what billing recorded for it, the journal of usage included, and Kaiten is not the organization's accounting system, so the settings offer the invoices (the same menu as the list: CSV by line, CSV by invoice, NDJSON) and the usage reports, a month to a file for the months the organization keeps, newest first (two years when the deployment does not say). The oldest month begins before the kept usage does, since the retention is told in months and not to the day: the API refuses with where the kept usage begins and the month is read again from there once. The usage is the instances', not billing's, so it is offered with billing off; the invoices only where billing is on, and the card is absent for a session that may export neither.
- **Metadata field types.** A field is a key, a label and a JSON Schema. The form offers six types: string, number, boolean, date, enum and enum list, mapped to `{ type: 'string' }`, `{ type: 'number' }`, `{ type: 'boolean' }`, `{ type: 'string', format: 'date' }`, `{ type: 'string', enum }` and `{ type: 'array', items: { type: 'string', enum }, uniqueItems: true }`. A non-empty description is added to the schema. Enum options are typed one per line, because a value may contain a comma; at least one is required. A raw mode edits the JSON Schema itself in a JSON editor. It must parse as a JSON object and compile as a JSON Schema.
- **Key rules.** A key starts with a letter and continues with letters, digits and underscores. It cannot be one of the resource's native keys (`id`, `name`, `slug`, `description`, `metadata`, `createdAt`, `createdBy`, `updatedAt` and `updatedBy`, plus the columns of that resource, listed in `app/src/features/settings/metadata-fields/schemas/metadata-fields.schema.ts`), and it cannot equal the key of an active field, compared case-insensitively. Reusing the key of an archived field is allowed with a warning that stored values are checked against the new schema. The key cannot change once the field exists.
- **Create and duplicate.** A new field takes the next display order (highest active order plus one). "Duplicate" opens the form filled with the source field, key left empty.
- **Edit.** An edit changes the label and the schema; the request never sends `displayOrder`, which only the reorder endpoint owns. The API rejects type changes and free-string to enum switches with a 422, and the toast shows its message. A field whose schema is none of the six types cannot be edited, but can be duplicated or archived.
- **Impact preview.** Before saving a schema whose structure changed (a change of `description`, `title`, `examples`, `default` or `$comment` does not count), the page calls the dry run. When existing values no longer match, a dialog states how many and lists examples (name and slug); "Save anyway" continues. With no impact, or a cosmetic change only, the field saves without asking.
- **Archive.** An archived field is hidden unless "Show archived" is on, keeps its values readable, and offers only "Unarchive". Archiving asks for confirmation and warns when the field is the last active one for the resource, because its columns and filters then disappear from the table.
- **Reorder.** Active fields reorder by drag and drop, or with the keyboard. The page sends the whole list of ids in the new order. Reordering is disabled with fewer than two active fields.
- **Access.** Reading requires the `read:metadata_fields` scope and every write `write:metadata_fields`. When the read is refused (403), the page shows a "Restricted access" state. When a write is refused, a toast and a banner say so and every action is disabled until the next successful fetch or a change of tab. Any other read failure shows an error state with "Retry". The other write errors show the API's message.
- **Empty state.** With no active field the page invites the user to create one, and says so when only archived fields exist.

## Tests

- Unit and component tests (Vitest): `app/src/features/settings/components/__tests__/settings-page-content.test.tsx`, and in `app/src/features/settings/metadata-fields/__tests__/`, `metadata-fields-page-content.test.tsx` (resource tabs, edit pre-fill with an immutable key, archive confirmation and the last-active warning, duplicate, restricted states, no `displayOrder` in the update body, invalidation after create, deferred required errors, the dry run skipped for a description-only change), `metadata-fields.schema.test.ts` (schema mapping, key rules, enum parsing, cosmetic versus structural edits, ordering) and `metadata-field-helpers.test.ts` (which failures of the GraphQL read count as a refusal).
- For billing: `billing/components/__tests__/billing-settings-page.test.tsx` (the cards, the save, the refusals, a session that may only read), `billing/components/__tests__/billing-health-card.test.tsx` (the figures and where they lead, the sync, the sync line of Stripe), `billing/utils/__tests__/` (what the health counts, how a pass went), `billing/schemas/__tests__/billing-settings.schema.test.ts`, `data-export/components/__tests__/export-data-card.test.tsx` and `data-export/queries/__tests__/` (the files and the retry of the oldest month).
- Stories: `app/src/features/settings/components/stories/settings-page-content.stories.tsx` (`Features/Settings/SettingsPageContent`, `Default`). The metadata fields page has none. The visual regression suite does not cover this story. The billing settings and the export before an organization is deleted have theirs, which run as tests: `app/src/features/settings/billing/components/stories/` (`Features/Settings/BillingSettings`: the providers with NoOp and with Stripe in each state, the health, the defaults, the retention and the page) and `app/src/features/settings/data-export/components/stories/` (`Features/Settings/ExportDataCard`: with and without billing).
- E2E: no spec opens `/settings/metadata`. `app/e2e/app/billing/billing.settings.spec.ts` opens `/settings/billing` and `billing.data-export.spec.ts` the export card of `/settings`, with `billing.french-screens.spec.ts`, `accessibility.billing-screens.spec.ts` and `mobile.billing-screens.spec.ts` reading them in French, for accessibility and on a phone. `app/e2e/app/instances/instances.metadata.spec.ts` covers the other side of the metadata fields: how instance pages show and collect the declared fields.

## Public API

`app/src/features/settings/index.ts` exports `SettingsPageContent`, `ApplicationSettingsSection`, `BillingSettingsPageContent`, `MetadataFieldsPageContent` and the types `MetadataResourceType` and `MetadataSettingsField`. Only the routes under `app/src/routes/settings/` import it, and they use `SettingsPageContent`, `BillingSettingsPageContent`, `MetadataFieldsPageContent` and `MetadataResourceType`, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)). `ApplicationSettingsSection` is used inside the feature only.
