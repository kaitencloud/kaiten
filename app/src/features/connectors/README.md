# Connectors

Connectors sync Kaiten data with the tools an organization already uses. From Integrations > Connectors, a user connects Attio with an API token, chooses how Kaiten fields map to Attio attributes, and then sees which customers and instances are synced and whether a sync failed. Attio and Stripe are the two working connectors. Stripe is the payment provider that collects the invoices of the subscriptions that use it: its page is where the restricted key of the Stripe account is typed, the options of the invoices are chosen and the connection is ended. HubSpot, Salesforce and Lago appear in the catalog as disabled tiles labelled "Coming H1" or "Coming H2".

## Routes

| URL | Route file | Renders |
| --- | --- | --- |
| `/integrations/connectors` | `app/src/routes/integrations/connectors/index.tsx` | The catalog, or the setup wizard, inside `ConnectorsPageShell` |
| `/integrations/connectors/$connectorId` | `app/src/routes/integrations/connectors/$connectorId.tsx` | `AttioConnectorDetail`, or `StripeConnectorDetail` for `stripe` |

`route.tsx` in the same folder is the layout: it sets the "Connectors" breadcrumb title and a Suspense boundary. The side navigation entry comes from `integrationsSubRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`.

The wizard has no route of its own. It is a view of the index route, switched by the setup store (`view: 'index' | 'wizard'`). The detail route accepts `attio` and `stripe` as `connectorId`. Any other id (Lago, an unknown one), or an Attio connector that is not connected, redirects to `/integrations/connectors`. The index loads `attioSettingsQueryOptions` in its loader. For Stripe the route guards on billing (`requireBillingCapability`, with `BillingNotFound` as its not-found component, so that a link to the page explains why billing is not there instead of failing) and loads `stripeSettingsQueryOptions`: the page opens connected or not, so there is no wizard and no redirect for a connector that is not connected yet.

## Structure

```txt
app/src/features/connectors/
├── index.ts               # route-level exports
├── constants.ts           # the catalog (CONNECTORS) and ATTIO_CONNECTOR
├── types/                 # ConnectorMeta and the catalog types
├── components/            # generic: page shell, page content (index or wizard), tiles grid, tile
│   └── stories/           # connectors.stories.tsx
├── attio/                 # everything specific to Attio
│   ├── attio.api.ts       # upsertAttioSettings, deleteAttioSettings
│   ├── constants.ts       # default API URL, sync policies, source fields, default mappings
│   ├── components/        # wizard (two steps), detail page, mapping editor dialog, synced records table
│   ├── hooks/             # useAttioSettingsMutations, useAttioSetupStore
│   ├── queries/           # settings query options, synced records, invalidation
│   ├── store/             # wizard state (TanStack Store)
│   ├── types/
│   └── utils/             # payload builders, mapping validation, slug check
└── stripe/                # everything specific to Stripe
    ├── constants.ts       # the tile, the tax behaviors, the permissions of the key, the docs link
    ├── components/        # detail page, header, standing notice, settings card and fields, disconnect dialog, overview
    │   └── stories/       # stripe-connector.stories.tsx
    ├── hooks/             # useStripeConnector (save, disconnect)
    ├── queries/           # stripeSettingsQueryOptions
    ├── schemas/           # the form of the connection, and its body
    └── utils/             # reading the stored settings, the mode of a key, what still routes to Stripe
```

In this page, a file inside the feature is written relative to `app/src/features/connectors/`. Any other path starts at the repository root.

The catalog, its tiles and the page shell are generic. The Stripe tile reads where Stripe stands from the billing capabilities (see [Stripe](#stripe)), not from the catalog. A tile shows the connector logo in its light or dark variant, or the connector's initial on a tinted background when it has no logo. The Attio logos are `app/public/images/connectors/attio/logo-black.svg` and `logo-white.svg`, referenced by `ATTIO_LOGO_ASSETS`.

What customers and instances share with this feature lives in the `crm-sync` domain (`app/src/domains/crm-sync/`, the paths below are relative to it), because a feature does not import another feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)):

- `components/`: `IntegrationSyncBadge` (the "CRM Sync" cell of the customers and instances tables), `AttioSyncCard` (the "Attio Synchronization" card of both detail pages), `SyncStatusBadge`, `SyncErrorDialog` and `AttioLogo`.
- `logic/`: `getAttioSyncInfo`, which reads the Attio entry of an entity's `integrations` map. It accepts the GraphQL `Map` scalar and the REST `integrations` payloads alike, and returns `null` when the entity has no Attio external id.
- `queries/`: `attioSettingsQueryOptions`, and the sync watcher described under [Behaviour](#behaviour).
- `constants.ts`: `ATTIO_CONNECTOR_NAME` and `ATTIO_LOGO_ASSETS`.

## Data

The connector name is `kaiten.integration.crm.attio` (`ATTIO_CONNECTOR_NAME`). The connector settings use three operations of the generated client, and the sync watcher reads two more:

| Operation | Used by |
| --- | --- |
| `getConnectorSettings` (`GET /connectors/{connectorName}/settings`) | `getAttioSettings` in `app/src/domains/crm-sync/queries/attio-settings-query-options.ts`. A 404 means "not connected" and resolves to `null`; any other error is thrown. The query key is `getConnectorSettingsQueryKey`. |
| `updateConnectorSettings` (`PUT` on the same path) | `upsertAttioSettings` in `attio/attio.api.ts`: the wizard's Finish button and the mapping editor's Save button. |
| `deleteConnectorSettings` (`DELETE` on the same path) | `deleteAttioSettings`: the Disconnect button. |
| `getCustomerIntegration` (`GET /customers/{customerSlug}/integrations/{integrationName}`) | `readAttioIntegration` in `app/src/domains/crm-sync/queries/attio-sync-coordinator.ts`: the sync watcher, for a customer. |
| `getInstanceIntegration` (`GET /instances/{instanceSlug}/integrations/{integrationName}`) | The same function, for an instance. |

`useAttioSettingsMutations` wraps `upsertAttioSettings` and `deleteAttioSettings` in `useMutation` (`connect`, `updateMapping`, `disconnect`), each with a success and an error toast. On settle, each calls `invalidateAttioQueries`, which invalidates the settings, the synced records, `getInstancesQueryKey()`, `instancesWithRelationsBaseQueryKey` and, through `invalidateCustomerQueries`, the customer queries: the customers and instances lists show the sync state of each row. Per-entity detail queries are left alone, because the sync runs asynchronously and their `integrations` payload does not change with the mutation.

The synced records table reads one GraphQL document, `GetAttioSyncedRecords` (`attio/queries/synced-records.queries.ts`): `customers(hasIntegration: $connectorName)` and `instances(hasIntegration: $connectorName)`, each with `id`, `slug`, `name` and the `integrations` map. `mapSyncedRecords` turns customers into Attio `Company` records and instances into `Workspace` records, and skips entities without an Attio external id. The query key is `attioSyncedRecordsBaseQueryKey`.

The settings payload is `{ attioApiKey, attioApiUrl, syncPolicy, fieldsMapping }`, validated by the API against the connector's settings schema (`additionalProperties: false`). `attioApiUrl` must be `https://api.attio.com` (`ATTIO_API_URL_DEFAULT`): the schema refuses any other value with a `400`, and the connector sends its requests to Attio's API whatever the stored settings say. `syncPolicy` is `create-and-bind` (default) or `fail-and-retry`, and `fieldsMapping` maps a source field key to an Attio attribute slug.

`attioApiKey` is write-only. GET and PUT responses return it redacted (`***`), and a PUT that omits it, or sends `***` or an empty value, keeps the stored key. Only the wizard sends a key. The mapping editor builds its payload with `buildMappingUpdateSettings`, which never includes it.

The console does not call the other operations of the connectors API: `GET /connectors`, `GET /connectors/{connectorName}`, `GET .../settings/schema`, `GET .../state` and `PUT .../activation` (Stripe's page calls `DELETE .../activation`, see [Stripe](#stripe)). `state` returns three independent booleans (`available`, `entitled`, `activated`) and answers 200 even when `available` is false. Because the console ignores it, it cannot tell "not in the organization's license" from "not configured yet"; when a save is refused, the API's error message appears in a toast.

A save also activates the connector for the organization, and a delete deactivates it, so the wizard needs no extra call. The API refuses activation when the organization's license does not include the connector.

Registering a connector is not part of this surface. It is `POST /api/platform/connectors`, a deployment-wide platform operation (`app/platform-openapi.yaml`). Attio never goes through it: the connector is compiled into the API (`api/internal/modules/connectors/attio/`) and registers its manifest at startup.

Scopes of the REST operations: reading the settings needs `read:organizations`, and saving, deleting or deactivating them needs `write:organizations`. The sync watcher's reads need `read:customers` for a customer and `read:instances` for an instance. The screens do not check scopes themselves.

## Behaviour

**Catalog.** `ConnectorsIndex` sorts the tiles into three sections: Connected, CRM and Billing. The Attio tile is Connected when the settings query returns a body and Available otherwise. Only its button works: Connect opens the wizard and Manage opens the detail page. The other tiles are disabled.

**Wizard.** Two steps, driven by `StepStack` from `@/functionals/step-stack`:

1. Connect: the Attio API token (a password field) and the sync policy. Continue stays disabled while the token is blank.
2. Map: the default mappings as locked rows, then optional rows, each pairing a source field with an Attio attribute slug.

Finish stays disabled while a save is pending, the token is blank or a mapping is invalid. It sends `{ attioApiKey, attioApiUrl: 'https://api.attio.com', syncPolicy, fieldsMapping }` and then navigates to the detail page. A refused save keeps the wizard open and shows the error toast. Cancel returns to the catalog and clears the typed token and the draft mappings, so the secret does not stay in memory.

**Mapping rules** (`validateAttioMappings`, one message per row):

- A row that has a source field or a slug needs both. Rows with neither are ignored and not sent.
- A slug is snake_case: `^[a-z0-9]+(?:_[a-z0-9]+)*$`. The API has no endpoint that lists Attio attributes, so this format check is the only client-side guard.
- A source field is used once. The picker hides fields already used, and Add row is disabled when every optional field is used.
- A target slug is used once per Attio object, and the default target slugs are reserved.

Customers map to Attio companies and instances to Attio workspaces. `ATTIO_SOURCE_FIELDS` in `attio/constants.ts` lists the source fields the UI offers. Those with a `defaultSlug` (`ATTIO_DEFAULT_MAPPINGS`) are always synced when unmapped, and appear as locked rows:

| Attio object | Source field | Default attribute |
| --- | --- | --- |
| Company | `customer.name` | `name` |
| Company | `customer.domain` | `domains` (a domain-typed value) |
| Workspace | `instance.id` | `workspace_id` |
| Workspace | `instance.name` | `name` |
| Workspace | `instance.customerExternalId` | `company` (a link to the company record) |

**Detail page** (`AttioConnectorDetail`):

- A header with the Attio tile, a Connected badge, an "Open in Attio" link to `https://app.attio.com` and a Disconnect button that asks for confirmation. A confirmed disconnect returns to the catalog.
- Three summary cards: the sync policy, the number of field mappings with a pencil that opens the mapping editor dialog, and the API URL.
- The synced records table: record name and slug, Attio object, Attio record id, last sync time and status. A failed row opens a dialog with the full Attio error. Refresh refetches the table. The table shows loading, error and empty states.

The mapping editor dialog reuses the wizard's schema step. It rebuilds its rows from the stored `fieldsMapping` and saves them without the API key.

**Sync state in customers and instances.** After a customer or an instance is created or updated, the customers and instances features call `startAttioSyncWatcher` (from `@/domains/crm-sync`). When Attio is connected, the watcher polls the entity's integration every 2 seconds for the first 10 seconds, then every 5 seconds, for at most 45 seconds. It stops early when the sync data changes, or after three consecutive errors other than 404. Meanwhile the badge and the card show a pending state, and a delayed state if nothing changed in time; the delayed state expires after 5 minutes. When the sync data changes, the entity's queries are refreshed. The state lives in the query cache under `['crm-sync', 'state', entityKind, entitySlug]`.

### Stripe

The connector name is `kaiten.integration.billing.stripe` (`STRIPE_CONNECTOR_NAME`, in the `billing` domain), and `stripe` is the id the console puts in its address. It uses the same connector operations as Attio, told apart by the name in the path, and `deactivateConnector` (`DELETE /connectors/{connectorName}/activation`), which Attio never needs. Where Stripe stands comes from the `providers` of the billing capabilities (`useBillingProvider('STRIPE')`: `connected` with the account it reaches, `available`, or `unavailableReason`), never from `features.stripe`, which the API fixes whatever Stripe can do here.

- **Tile.** Under the billing group, from the capabilities: Available (opens the page), Connected (in the connected section, to manage), or Unavailable with its reason under its name ("Not included in your plan", "Stripe needs a configured Vault", or the generic one for an API that does not list Stripe), and no way to try. The tile says the plan leaves Stripe out even where billing is off for that very reason: `useBillingProvider` offers nothing where billing is off, but its `listedStanding` reads the entry whether billing is on or not. Until the capabilities are in the tile keeps its catalog entry rather than claim Stripe is unavailable.
- **Page.** A header (Stripe, its standing and, once connected, a Test mode or Live mode badge, a link to the dashboard of that account and the Disconnect button for a session that may write the settings of the organization), a notice where Stripe cannot be connected, the connection, and what Kaiten and Stripe each do with the permissions the key needs.
- **The key** is a password field (`TextField type="password"`) of a restricted key, `^rk_(live|test)_[A-Za-z0-9]+$`. A secret key (`sk_`) or a publishable one (`pk_`) is refused in words, before anything is sent. It is write-only: the field opens empty and says there is one on file ("Key set (Test mode)..."), an empty field keeps it, and what is typed is cleared once saved. As it is typed, the field says which account it reaches. A save also connects, and the button reads Connect Stripe, Connect Stripe with the stored key (after a disconnection, which keeps the key) or Save changes.
- **The options** are the tax behavior of the amounts (exclusive or inclusive), whether Stripe computes tax and whether it finalizes invoices at once (off, an invoice stops as a draft in Stripe for a person to review, and the invoice page offers to finalize it). The body sends the options always and the key only when one was typed.
- **Refusals** are shown where the person is looking, in the API's words, with what was typed kept: Stripe rejecting the credentials (422 `CredentialsRejected`) on the key field; an account that changed (409 `AccountChanged`, a key of another account while customers already live in this one), a Stripe that cannot be reached (503, with Retry) and a settings schema failure above the button.
- **Where it cannot be connected** (the plan leaves it out, or a self-hosted deployment has no Vault to keep the key in, with a link to the settings of the deployment) the page says why, and the key and the button are there and off. A session that may read the settings and not write them sees them with a notice and no button.
- **Disconnecting** asks for confirmation. The API refuses (409 `DeactivateConnector.BillingActive`) while a subscription that is not canceled or an invoice that is not settled still routes to Stripe: the dialog stays on the API's words with how many there are, and the connector stays connected. The key stays stored, so that connecting again asks for none. Connecting or disconnecting refreshes the billing capabilities, the health of billing and the settings.

### What the sync does

The connector runs inside the API process. It is event-driven: Debezium change data capture feeds RabbitMQ, and one Dapr subscription hands each delivery to the audit trail and to the connector, each with its own inbox mark, so a failed sync retries alone. The connector reacts to `com.kaiten.customer.v1.created`, `com.kaiten.customer.v1.updated`, `com.kaiten.instance.v1.created` and `com.kaiten.instance.v1.updated`.

- A sync runs only for an organization that has activated the connector and saved its settings. Other events are skipped without a retry.
- Mapped values are synced as text. The license type, the license name and the deployment zone name are not in the event: the connector reads them in process, only when the field is mapped. License dates are truncated to `YYYY-MM-DD`.
- With `create-and-bind`, an update for an entity without an Attio record creates the record and links it. With `fail-and-retry`, it creates nothing and asks for a redelivery.
- Per entity, the API stores `external_id`, `web_url`, an adapter-specific `metadata`, `synced_at` and `last_error`. The `web_url` is a validated http(s) link to the record; the console checks the scheme again before rendering it and shows "View in CRM" only when it is present.
- `last_error` is recorded only for a permanent failure on an entity that already has an Attio record, and the next successful sync clears it. A failure while creating the record is visible in the API logs only.
- The API has no endpoint to validate a token, send a test event, list Attio attributes or read sync statistics, and the UI does not offer them.

### Local development

The API keeps connector settings, and so the Attio key, in Vault. Locally it uses a fake Vault: `compose.yml` sets `VAULT_FAKE_FILE_PATH` to `/credentials/fake-vault.json` in the API container. With the default `KAITEN_DEV_DIR`, that is `dev/fake-vault.json` in the repository root (the `dev/` folder is git-ignored), so a saved key can be read back with `cat`. The connector reads the same store the settings endpoints write, so what the wizard saves, key included, is what the sync uses. `task up`, `task quickstart` or `task dev` from the repository root starts the API, and the connector needs no other process.

## Tests

- Unit tests, run with `pnpm run test` from `app/`:
  - `components/connector-tile.test.tsx` and `components/connectors-page-content.test.tsx`.
  - `attio/store/attio-setup-store.test.ts`, `attio/queries/synced-records-query-options.test.ts` and, in `attio/utils/`, `attio-mapping-validation.test.ts`, `attio-slug.test.ts` and `build-attio-settings.test.ts`.
  - The `crm-sync` domain has its own tests: `app/src/domains/crm-sync/components/__tests__/`, `app/src/domains/crm-sync/logic/__tests__/`, `app/src/domains/crm-sync/queries/attio-sync-coordinator.test.ts` and `app/src/domains/crm-sync/queries/attio-sync-state.test.ts`.
  - Stripe: `components/connectors-stripe-tile.test.tsx` (the tile in each standing), `stripe/components/stripe-connector-detail.test.tsx` (the page and its refusals), `stripe/schemas/stripe-settings.schema.test.ts`, and `stripe/utils/stripe-settings.test.ts` and `stripe-refusals.test.ts`.
- Stories: `stripe/components/stories/stripe-connector.stories.tsx` (`Features/Connectors/Stripe`: not connected, a key rejected, a Stripe that cannot be reached, connected in each mode, an account that changed, a disconnection refused, and the two reasons it cannot be connected) and `components/stories/connectors-stripe-tile.stories.tsx` (the tile in each standing). `components/stories/connectors.stories.tsx` (`Features/Connectors/Attio`) has the `Catalog`, `SetupWizard`, `Detail` and `DetailSyncError` stories, with `play` functions. They open in Storybook (`pnpm run storybook` from `app/`). `app/vite.config.ts` excludes the file from `pnpm run test:stories`, because the end-to-end spec covers the flow.
- End to end: `app/e2e/app/connectors/connectors.lifecycle.spec.ts` connects Attio through the wizard, checks the synced records and disconnects. `connectors.stripe.spec.ts` (driven by `StripeConnectorDriver`) walks the Stripe tile and page: the tile in each standing, Lago and unknown ids redirecting, the key that is write-only, each refusal, the reasons it cannot be connected, a session that may only read, and a disconnection that is refused and one that succeeds. They run with `pnpm run test:e2e:app` from `app/`, on the mocks in `app/e2e/app/_support/mocks/install-connector-app-mocks.ts` (and `install-billing-app-mocks.ts`, for Stripe's standing) and the model `app/e2e/app/_support/model/connector-app-model.ts`.

## Public API

`index.ts` exports `ConnectorsPageContent`, `ConnectorsPageShell`, `AttioConnectorDetail`, `attioSettingsQueryOptions`, `ATTIO_CONNECTOR`, `StripeConnectorDetail`, `stripeSettingsQueryOptions` and `STRIPE_CONNECTOR`. Only the two route files import them, as `@/features/connectors`. `attioSettingsQueryOptions` is defined in the `crm-sync` domain and re-exported here.
