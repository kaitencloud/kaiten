# Glossary

The terms a contributor meets in the console's code and screens: first the product vocabulary, then the vocabulary of the codebase. Product terms are defined from the API contract (`app/openapi.yaml`) and the code that uses them. For React, TanStack and TypeScript terms in general, see their own documentation.

## Product

### Organization

The tenant. The Core API scopes every resource to the organization of the caller's credential, and slugs are unique per organization. The console shows the data of the organization of the signed-in session.

### Core API and Platform API

The **Core API** is the REST API for an organization's resources: customers, licenses, instances, feature flags and the rest. It is described by `app/openapi.yaml`, and the console's client is generated from it. The **Platform API** covers platform-wide operations (organizations, memberships, users, organization tokens, connector registration). It is described by `app/platform-openapi.yaml` and authenticated by a platform token that carries no organization; an operation that acts inside an organization names it in the path. The console builds no client from it. See [the API contract](./01-architecture/api-contract.md).

### Slug

The URL-friendly identifier of a resource, optional on create (the API generates one) and unique per organization. API paths take it (`{licenseSlug}`) and so do the routes (`$licenseSlug`). A token's slug is unique per service account. `generateSlug` in `app/src/functionals/slug/` turns a name into one.

### Customer

A customer of the organization: a name, an optional `domain`, an optional `externalCustomerId` (its identifier in another system) and its `integrations`. A customer has instances. Feature: `app/src/features/customers/`.

### Instance

A customer's use of a license. It references one customer and one license version, has start and end license dates, an operational `status` (`HEALTHY`, `DEGRADED`, `INCIDENT` or `MAINTENANCE`), a free-form commercial `lifecycleStage` and typed `metadata`, and can be placed on a deployment zone. Its entitlement usage and its audit trail are read per instance. Feature: `app/src/features/instances/`.

### License

What an instance is on: a named set of entitlement grants. One license record is one **version** of a license family: it has a `version` number that the server assigns, an optional `versionName`, a `type` (`DEVELOPMENT`, `TRIAL`, `PAID` or `COMMUNITY`) and a lifecycle state. `DRAFT` is not on sale, `PUBLISHED` is on sale, `ARCHIVED` is withdrawn: instances already on it keep it, and no instance can be assigned to it. Publishing, archiving and unarchiving are dedicated operations. Feature: `app/src/features/licenses/`.

### License family

The product that several license versions belong to (`familyId`, `familySlug`), stable across renames and new versions. A family resolves to one version, its `currentVersion`: the version marked as default (at most one, and it must be published), otherwise its highest-numbered published version. The console groups versions by `familyId`, never by name.

### Entitlement

A capability or a limit that a license can grant, defined once per organization. Its `type` is `BOOLEAN` (on or off), `NUMBER` (a quantity), `CONFIG` (a structured value) or `NUMBER_AI_CREDIT`. A license grants it with a value, which the contract calls a license entitlement. For a `NUMBER`, the value is a cap: unlimited, hard, or exceedable by a set percentage (`limitCapExceededOveragePercent`). The usage of a `NUMBER` entitlement is reported per instance, and can reset on a period (`resetPeriod`). Feature: `app/src/features/entitlements/`.

### Entitlement group

A named set of entitlements (`/entitlement-groups`). It groups entitlements for display and filtering, and its usage can be aggregated for an instance. Deleting a group does not delete its entitlements.

### Deployment zone

One place where a customer runs a release: a target the customer names and classifies, holding the release currently on it. It is not an installation of Kaiten. Its `type` is free-form; the console labels `production`, `staging` and `development`, and targeting rules can match it. Changing its release records a deployment. Feature: `app/src/features/deployment-zones/`.

### Release

A `version` that bundles components. A release is immutable: it has no update operation and its components are fixed at creation. Correcting one means deleting it and creating another, which starts a new deployment history. A release is deployed to deployment zones. Feature: `app/src/features/releases/`.

### Component

A named, versioned piece that releases bundle. Updating a component that a release links to creates a new version (`previousComponentId` points to the one before) instead of changing it in place. Feature: `app/src/features/components/`.

### Metadata field

A typed field that an organization declares for a resource type, `DEPLOYMENT_ZONE` or `INSTANCE`: a `key`, a `label` and a JSON Schema 2020-12 document. The values live in the resource's `metadata` and are validated against the schema. A field is archived, not deleted. Code: `app/src/domains/metadata-fields/` and `app/src/functionals/metadata-fields/`.

### Connector

A registered integration with an external system, identified by a stable name such as `kaiten.integration.crm.attio`. An organization activates a connector and stores its settings, validated against the connector's settings schema. The console sets up the Attio connector, which syncs customers and instances with a CRM. Feature: `app/src/features/connectors/`.

### Integration

The link between a customer or an instance and a record in an external system, grouped by adapter name (`integrations` on the resource). An integration can be resolved from its adapter and external id (`/integration/{adapter}/customer/{externalId}`).

### Feature flag

A value evaluated at run time for a context. A flag has a `type` (`boolean`, `string`, `number` or `object`), `variants`, a `default_variant`, `targetings` and an `enabled` switch. Flags are evaluated through the OpenFeature Remote Evaluation Protocol (OFREP) endpoints, `/ofrep/v1/evaluate/flags`. Feature: `app/src/features/feature-flags/`.

### Variant

One possible value of a feature flag: a `name`, a `value` and a `description`.

### Default variant

What a flag serves by default: the name of one of its variants, or a rollout configuration, by date or by percentage.

### Targeting rule

An entry of a flag's `targetings` that decides which variant a context gets. There are three kinds: a rule written as a CEL expression that assigns one variant, a rollout by date and a rollout by percentage. The editor is `app/src/features/feature-flags/targeting/`.

### Targeting context

The identifiers a targeting rule may read, such as `__kaiten.deploymentZone.type`. The server enriches the context from the license, the entitlements, the instance, the customer and the deployment zone. `GET /feature-flags/targeting/context` lists them, `POST /feature-flags/targeting/lint` checks a rule and `POST /feature-flags/targeting/test` rehearses one without saving anything.

### CEL

The Common Expression Language, the language of targeting rules. The console has a Monaco-based editor for it, `app/src/functionals/cel-editor/`.

### Service account

A machine user of an organization. It holds API tokens (`/service-accounts/{serviceAccountSlug}/tokens`). Feature: `app/src/features/service-accounts/`.

### Token and scope

A **token** authenticates a service account. Its value is returned once, when it is created. A **scope** is `read:<resource>` or `write:<resource>`; a token carries the scopes it was given. The resources are the ones of `app/src/lib/api/scopes.gen.ts`, generated from the contract, and the scope each operation requires is `OPERATION_SCOPES` in `app/src/lib/api/operation-scopes.gen.ts`. The billing domain reads the scopes of the session from its token (`app/src/lib/granted-scopes.ts`, through `useCanPerform`), only to hide the actions the API would refuse.

### Billing capabilities

`GET /billing/capabilities` says whether billing is on for the organization (`enabled`, and `disabledReason` when it is not), which providers can collect invoices and which `features` the running release ships. The console shows billing only when it answers `enabled`: the side navigation and the guards of the billing routes read it, and a failure to read it reads as off. Code: `app/src/domains/billing/`.

### Webhook

An outbound HTTP subscription to events. A webhook has a URL and a signing secret that the console reveals on demand, subscribes to event types such as `com.kaiten.license.v1.created`, and has a delivery history. The console calls its endpoints from `app/src/features/webhooks/webhooks.api.ts`; they are not in `app/openapi.yaml`, whose `webhooks` section declares the events. Feature: `app/src/features/webhooks/`.

### Audit trail

The record of the events of an organization: each entry has an `eventName`, an `eventType`, a `timestamp` and a `payload`. The API exposes it per instance (`GET /instances/{instanceSlug}/audit-trails`) and, through GraphQL, for the whole organization (`organizationAuditTrails`). The console shows all the events on `/audit-trail`, including those tied to no instance, such as a customer created, and one instance's events on its detail page. Each event the API emits has a label in the console, typed against the contract so that a new event fails the type check until it has one. Code: `app/src/domains/audit-trail/` and `app/src/features/audit-trail/`.

### Notification

An entry of a user's feed, built from the organization's audit trail and narrowed to the events the user subscribes to. Each user sets preferences per event and channel. Feature: `app/src/features/notifications/`.

## Architecture

### Assembler (thin route)

A TanStack route whose only job is to connect a URL to a feature component: it declares the path, runs the `loader`, reads the params and renders. It holds no business logic. `app/src/routes/customers/index.tsx` is one. See [routes as assemblers](./03-patterns/routes-as-assemblers.md).

### Barrel export

An `index.ts` that re-exports the public symbols of a folder. The root barrel of a feature is the API its routes use, and only routes import it:

```typescript
// app/src/features/customers/index.ts
export {
  CustomerDetailPageContent,
  CustomerFormDialog,
  CustomersPageContent,
} from './components';
export { customerQueryOptions } from './queries';
```

The barrels of the subfolders (`components/`, `hooks/`, `queries/`) are internal to the feature.

### Domain

A business module in `app/src/domains/` shared by several features of one sub-domain: aggregated queries, read models, pure logic, shared forms and components. Never a page. Examples: `customer-management`, `release-management`, `audit-trail`, `metadata-fields`. See [layers](./AI_CONTEXT.md#layers).

### Feature

A product area in `app/src/features/`, such as `licenses` or `feature-flags`. It owns its screens, mutations, UI state and schemas, and exposes a route-level `index.ts`. Every feature documents itself in a `README.md` in its folder.

### Functional

A generic widget or layout in `app/src/functionals/` with non-trivial logic and several independent consumers, and no business contract. Examples: `table`, `filters`, `page`, `stat-card`, `cel-editor`, `route-tabs`. Import it as `@/functionals/<name>`. See [functionals](./01-architecture/functionals.md).

### Shared component

Generic UI in `app/src/components/`: the primitives of `ui/`, the form system, dialogs. No business vocabulary. See [components](./05-components/README.md).

### View model hook

A hook that assembles several data sources for a complex detail page and delegates to specialised hooks. `use-instance-detail-view-model.ts` in `app/src/features/instances/hooks/` delegates to `use-instance-detail-data`, `use-instance-detail-mutations` and `use-instance-detail-derived-state`.

## Data and state

### Generated client

The code in `app/src/api-client/`, generated from the OpenAPI contract and the GraphQL schema by `pnpm run generate` in `app/`. It holds the types, the SDK functions, the TanStack Query options, mutations and keys, and the Zod schemas. It is git-ignored and never edited by hand. See [generated code](./AI_CONTEXT.md#generated-code).

### REST and GraphQL

REST serves the standard operations on one resource. GraphQL serves the lists that carry joined data, such as customers with their instances (`customersWithInstancesQueryOptions`). An entity read through both needs both query keys invalidated after a mutation. See [query key invalidation](./02-conventions/query-key-invalidation.md).

### Query options

A `queryOptions({ queryKey, queryFn })` object that a route `loader` and a component both use, so they share one cache entry. `customersWithInstancesQueryOptions` is one; the generated client also produces them (`getCustomerOptions`).

### Query key

The identifier of a TanStack Query cache entry. Use the functions the client generates, such as `getLicensesQueryKey()`, and not a hand-written array, so an invalidation reaches every query under it.

### `ensureQueryData` and `useSuspenseQuery`

`ensureQueryData` is called in a route `loader`: it returns the cached data when it has them and fetches otherwise, so the data are ready before the first render. `useSuspenseQuery` reads that entry in the component and suspends until it is available.

### Invalidation helper

A function that invalidates every query key of one entity, called from the mutations that change it: `invalidateLicenseQueries` in `app/src/features/licenses/queries/license-query-options.ts`, `invalidateCustomerQueries` in `app/src/domains/customer-management/queries/customer-query-invalidation.ts`.

### Optimistic update

An update of the cache before the server confirms, rolled back on error. `optimisticDeleteCallbacks` in `app/src/lib/optimistic-mutations.ts` does it for deletions from a list.

### TanStack Store

The library for the UI state of a feature (a dialog that is open, a selection). Server data stays in TanStack Query. See [state management](./03-patterns/state-management.md).

### `useAppForm`

The app's TanStack Form hook, in `app/src/hooks/form.ts`, with the app's field components and submit button registered. Every form uses it; `withForm` and `withFieldGroup` come from the same file. See [forms](./03-patterns/forms.md).

## Patterns

### Dialog via route

A dialog controlled by the URL: a child route renders it while the parent route stays mounted. See [dialog via route](./03-patterns/dialog-via-route.md).

### Loader and Suspense

The loading pattern of a route: the `loader` preloads with `ensureQueryData`, the component reads with `useSuspenseQuery`. While a loader runs longer than the router's pending delay, the route's `pendingComponent` is shown (`RoutePending` in `app/src/components/route/`).

## Naming

| Type | Convention | Example |
| --- | --- | --- |
| Files | kebab-case (checked by lint) | `customer-table.tsx`, `use-feature-flag-form.ts` |
| Components | PascalCase | `CustomersTable`, `CustomerTableActions` |
| Hooks | `use` and camelCase | `useFeatureFlagForm`, `useToggleFeatureFlag` |
| Types | PascalCase | `Customer`, `FilterFieldDefinition` |
| Constants | UPPER_SNAKE_CASE | `MAX_PAGE_SIZE`, `ATTIO_CONNECTOR_NAME` |
| Routes | kebab-case segments, `$param` for a parameter | `/feature-flags/$featureFlagSlug` |
| Feature folders | kebab-case | `feature-flags/`, `service-accounts/` |

## Internationalization

### `useTranslation()`

The react-i18next hook that returns `t`, the translation function. It takes no argument here: keys are always written in full.

```typescript
const { t } = useTranslation();
t('Pages.Customers.title'); // 'Customers'
```

### Translation key

The path of a string in `app/src/lib/i18n/locales/en.ts`, such as `Pages.Licenses.Mutation.Form.Labels.name`. The first level is `Common`, `Pages`, `Features`, `Functionals`, `Errors` or `Sign`. A key is added to `en.ts` and `fr.ts`. See [i18n](./02-conventions/i18n.md).

### Interpolation

A variable injected into a string with `{{ }}`: `Common.confirmDeleteDescription` reads "This action cannot be undone. This will delete {{name}}", and `t('Common.confirmDeleteDescription', { name })` fills it.

### `changeLanguage()`

Exported by `app/src/lib/i18n/config.ts`. It changes the active language and stores it in the app settings. Call it instead of `i18n.changeLanguage()`.

## Tools

### Vite+

The toolchain that bundles Vite, Vitest, Oxlint and Oxfmt behind the `vp` command. The scripts of `app/package.json` call it; run them with `pnpm run`, for example `pnpm run lint`, `pnpm run fmt` or `pnpm run check`. See [scripts](./00-getting-started/scripts.md).

### Storybook

The component workshop. Stories are `*.stories.tsx` files in `stories/` folders next to their components. Run `pnpm run storybook` from `app/`. Stories also run as tests: see [integration tests](./06-testing/integration-tests.md).

### sonner

The toast library. Import `toast` from `sonner` directly: `import { toast } from 'sonner'`.

### SQLC

A Go code generator for SQL queries, used by the API and not by the frontend. There is one `sqlc.yaml` per module or infrastructure package, such as `api/internal/modules/licenses/infrastructure/db/sqlc.yaml`, and the generated `*.sql.go` files sit next to it. Regenerate with `task generate:sqlc` from the repository root.

## See also

- [Architecture overview](./01-architecture/overview.md)
- [Folder structure](./01-architecture/folder-structure.md)
- [Feature template](./04-features/_template/FEATURE_TEMPLATE.md)
- [Code style](./02-conventions/code-style.md)
