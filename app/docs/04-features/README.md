# Features

A feature is a product area of the console: a folder of [`app/src/features/`](../../src/features/) that owns its screens, its mutations, its UI state and its form schemas. Each feature documents itself in its own README, `app/src/features/<name>/README.md`, next to its code.

This page is the entry table. It has one row per folder of `app/src/features/`. The routes are the files of `app/src/routes/` that render the feature: a route only loads data and assembles a feature (see [routes as assemblers](../03-patterns/routes-as-assemblers.md)), so the feature README says what each screen does.

| Feature | Main routes | What it does |
| --- | --- | --- |
| [`audit-trail`](../../src/features/audit-trail/README.md) | `/audit-trail` | The audit trail of the whole organization: a feed of events to search, filter, inspect and export as CSV. |
| [`billing`](../../src/features/billing/README.md) | `/billing/invoices`, `/billing/invoices/$invoiceId`, `/billing/invoices/$invoiceId/lines/$lineId`, `/billing/handoff` | The invoices of the organization, where billing is on: list with search, filters, sorting and an export, the way the other lists work, one invoice with its audited actions and the usage behind each metered line, and the handoff queue its accounting system reads. |
| [`components`](../../src/features/components/README.md) | `/releases/components`, `/releases/components/new` | The catalog of the components that releases bundle, with a dialog to create one. |
| [`connectors`](../../src/features/connectors/README.md) | `/integrations/connectors`, `/integrations/connectors/$connectorId` | Connectors that sync Kaiten data with external tools: the catalog, the setup wizard and the status of the Attio connector. |
| [`customers`](../../src/features/customers/README.md) | `/customers`, `/customers/new`, `/customers/$customerSlug` | Customers: list, create, edit, delete, and a detail page with the customer's instances. Where billing is on: the billing e-mail and the invoices of the customer. |
| [`dashboard`](../../src/features/dashboard/README.md) | `/dashboard` (`/` redirects to it) | The landing page: figures, insight cards and charts computed from the lists the API returns. |
| [`demo-sandbox`](../../src/features/demo-sandbox/README.md) | none: mounted by the root layout (`app/src/routes/__root.tsx`) and by `/settings` | A banner and a Settings card that seed and reset demo data, for organizations that the `demo-sandbox` flag marks. |
| [`deployment-zones`](../../src/features/deployment-zones/README.md) | `/releases/deployment-zones`, `/releases/deployment-zones/new`, `/releases/deployment-zones/$zoneSlug` | Deployment zones: list, create, edit, delete, deploy a release to a zone, and a detail page with the other zones that run the same release. |
| [`entitlements`](../../src/features/entitlements/README.md) | `/entitlements`, `/entitlements/new`, `/entitlements/$entitlementSlug` | Entitlements, what a license can grant: list, create, edit, delete (a dialog says what still uses one that cannot be), group, and a detail page with the licenses that grant one and its usage. |
| [`feature-flags`](../../src/features/feature-flags/README.md) | `/feature-flags`, `/feature-flags/new`, `/feature-flags/$featureFlagSlug` | Feature flags: list, switch on and off, create, edit variants, default strategy and targeting rules, and preview an evaluation. |
| [`instances`](../../src/features/instances/README.md) | `/customers/instances`, `/customers/instances/new`, `/customers/instances/$instanceSlug`, `/customers/instances/$instanceSlug/billing` | Instances, a customer's use of a license version: list, create, edit, delete, deploy to a zone, and a detail page with entitlements, the usage history of each, audit trail and, where billing is on, its subscription, its upcoming invoice and its invoices, with the dialog that subscribes it. |
| [`licenses`](../../src/features/licenses/README.md) | `/licenses`, `/licenses/new`, `/licenses/$licenseSlug`, `/licenses/$licenseSlug/prices` | License versions grouped by product: create, open a version to manage its grants, publish, archive and set the default. Where billing is on: the prices of a version, the preview of its invoice, and how it is sold. |
| [`notifications`](../../src/features/notifications/README.md) | `/notifications`, `/settings/notifications` (the bell in the header has no route) | The notification bell and panel, the feed page and the preferences page, with live updates over Server-Sent Events. |
| [`releases`](../../src/features/releases/README.md) | `/releases`, `/releases/new`, `/releases/$releaseSlug` | Releases, bundles of component versions: list, create, delete, and a detail page with the zones that run one. |
| [`service-accounts`](../../src/features/service-accounts/README.md) | `/integrations/service-accounts`, `/integrations/service-accounts/new`, `/integrations/service-accounts/$serviceAccountSlug/tokens/new` | Service accounts and their API tokens: create an account, create a token with chosen scopes, revoke tokens. |
| [`settings`](../../src/features/settings/README.md) | `/settings`, `/settings/metadata`, `/settings/billing` | The settings entry page with the export of the data to keep before an organization is deleted, the metadata fields that an administrator declares for deployment zones and instances, and, where billing is on, who collects the invoices, the defaults of a subscription and how long usage is kept. |
| [`webhooks`](../../src/features/webhooks/README.md) | `/integrations/webhooks`, `/integrations/webhooks/history` | Outbound webhooks: create, delete, reveal the signing secret, and read the delivery history. |

When you add or remove a folder in `app/src/features/`, add or remove its row here.

## Where to go next

- Write a new feature: the [feature template](./_template/FEATURE_TEMPLATE.md) gives its structure, and the [feature README model](./_template/FEATURE_TEMPLATE.md#feature-readme-model) the structure of its README.
- Run or write the tests of a feature: [`app/src/features/README.md`](../../src/features/README.md), then the [testing guide](../06-testing/README.md).
- Know which imports a feature may use: [Import rules](../AI_CONTEXT.md#import-rules).
