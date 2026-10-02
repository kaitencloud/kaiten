# Settings

The settings page is the entry to what an administrator configures. It links to the organization's settings pages and holds the settings the browser remembers (language, side navigation). The metadata fields page lets an administrator declare typed fields for deployment zones and instances: create, edit, duplicate, archive and reorder them.

## Routes

| Path | Route file | What it renders |
| --- | --- | --- |
| `/settings` | `app/src/routes/settings/index.tsx` | `SettingsPageContent` |
| `/settings/metadata` | `app/src/routes/settings/metadata.tsx` | `MetadataFieldsPageContent` |
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
│   ├── application-settings-section.tsx # language, side navigation state, reset
│   ├── __tests__/, stories/
│   └── index.ts
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

The `/settings` page has no server data. Its browser settings come from `useAppSettings` (`app/src/hooks/use-app-settings.ts`), a live query over `app/src/lib/settings/`: a TanStack DB collection persisted in `localStorage` under `kaiten:app-settings`, holding `language`, `theme` and `sideNavExpanded`.

The metadata fields page reads and writes as follows:

- **Read.** `metadataFieldsSettingsQueryOptions(resourceType)` calls `fetchMetadataFields(resourceType, true)` from `@/domains/metadata-fields`. That runs the GraphQL query `MetadataFields` (`metadataFields(resourceType, includeArchived, limit, cursor)`), walks the pages (200 rows each) and sorts by display order, then label, then key. The page asks for archived fields too, so its key is `['settings', 'metadata-fields', resourceType, 'includeArchived:true']`.
- **Write.** The generated REST mutations `createMetadataFieldMutation`, `updateMetadataFieldMutation`, `archiveMetadataFieldMutation`, `unarchiveMetadataFieldMutation` and `reorderMetadataFieldsMutation`.
- **Impact preview.** The SDK function `dryRunMetadataField` (`POST /metadata-fields/{id}/dry-run`).
- **Invalidation.** After every mutation, the page's key and `metadataFieldsActiveQueryKey(resourceType)` (`['metadata-fields', resourceType, 'includeArchived:false']`), which the screens that show the fields read, so a change reaches them at once.

## Behaviour

- **Browser settings.** The language select offers English and French; a change is stored and applied at once. The card states whether the side navigation is expanded or collapsed. "Reset local settings" asks for confirmation, then restores the defaults (English, dark theme, expanded side navigation) on this device.
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
- Stories: `app/src/features/settings/components/stories/settings-page-content.stories.tsx` (`Features/Settings/SettingsPageContent`, `Default`). The metadata fields page has none. The visual regression suite does not cover this story.
- E2E: no spec opens `/settings` or `/settings/metadata`. `app/e2e/app/instances/instances.metadata.spec.ts` covers the other side: how instance pages show and collect the declared fields.

## Public API

`app/src/features/settings/index.ts` exports `SettingsPageContent`, `ApplicationSettingsSection`, `MetadataFieldsPageContent` and the types `MetadataResourceType` and `MetadataSettingsField`. Only the routes under `app/src/routes/settings/` import it, and they use `SettingsPageContent`, `MetadataFieldsPageContent` and `MetadataResourceType`, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)). `ApplicationSettingsSection` is used inside the feature only.
