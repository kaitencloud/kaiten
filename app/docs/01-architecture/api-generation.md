# API client generation

The types, validation schemas, request functions and TanStack Query helpers the
console uses for the API are generated from the API contract. They live in
`app/src/api-client/`, which git ignores and nobody edits by hand.

> **One source of truth.** For a REST operation, `app/openapi.yaml` (produced from
> the Go handlers) decides the types, the validation constraints and the request
> functions. Never redefine by hand what is generated.

The contract files themselves, and where each one comes from, are listed in
[api-contract.md](./api-contract.md).

## What is generated from what

| Contract | Source | Tool | Output |
| --- | --- | --- | --- |
| REST (Core API) | `app/openapi.yaml` | `@hey-api/openapi-ts` | `src/api-client/` (`types.gen.ts`, `zod.gen.ts`, `sdk.gen.ts`, `@tanstack/react-query.gen.ts`, `msw.gen.ts`, the fetch client in `client/` and `core/`) |
| REST scopes | `app/openapi.yaml` (`x-kaiten-scopes`) | `packages/api-codegen/generate-scopes.js` | `src/lib/api/scopes.gen.ts` (tracked) |
| Scope of each operation | `app/openapi.yaml` (the `security` of each operation) | `packages/api-codegen/generate-scopes.js` | `src/lib/api/operation-scopes.gen.ts` (tracked): `OPERATION_SCOPES`, keyed by the SDK name of the operation (`getBillingCapabilities`) |
| GraphQL | the `.graphqls` files in `api/` | GraphQL Code Generator | `src/api-client/graphql/` |

```
Go handlers ──task generate:oas──▶ app/openapi.yaml ──generate-api-sdk──▶ src/api-client/*.gen.ts
                                                                          src/lib/api/scopes.gen.ts
                                                                          src/lib/api/operation-scopes.gen.ts
api/**/*.graphqls (written by hand) ──generate-graphql──▶ src/api-client/graphql/
                    └──task generate:gqlgen (go generate)──▶ Go resolvers and models
```

`task generate:oas` also writes `app/platform-openapi.yaml`, the Platform API
document. The console builds no client from it.

The `.graphqls` files are sources, not outputs. Editing one and running
`task generate:gqlgen` regenerates the Go resolvers; `codegen.ts` reads the same
files to build the TypeScript client.

## Commands

From the repository root:

```bash
task generate        # generate:oas, then pnpm install and pnpm run generate in app/
task generate:oas    # OpenAPI documents from the Go source
task generate:gqlgen # Go side of GraphQL: resolvers and models (not the console client)
```

From `app/`:

```bash
pnpm run generate          # generate-api-sdk, then generate-graphql
pnpm run generate-api-sdk  # REST only: openapi-ts, scopes.gen.ts and operation-scopes.gen.ts
pnpm run generate-graphql  # GraphQL only: graphql-codegen --config codegen.ts
```

Always run `pnpm run generate`. `generate-api-sdk` on its own deletes
`src/api-client/graphql/`, and the app stops compiling until `generate-graphql` has
run again.

`src/api-client/` is not tracked: after a clone, nothing type-checks until the
client has been generated. `task dev` and `task generate` do it, and the CI runs
it before it lints, type-checks, tests or builds.

After a change to the API contract, run `task generate:oas`, then
`pnpm run generate` in `app/`, and commit the regenerated `app/openapi.yaml`,
`app/platform-openapi.yaml`, `app/src/lib/api/scopes.gen.ts` and
`app/src/lib/api/operation-scopes.gen.ts`. TypeScript then flags every call site
the change breaks.

Configuration:

- `packages/api-codegen/openapi-ts.config.js`: hey-api input, output and plugins
  (the default plugins, `zod` and `@tanstack/react-query`).
- `app/codegen.ts`: GraphQL schema files, document glob, scalar mapping.

`packages/api-codegen` is its own workspace package with its own TypeScript: the
app compiles with TypeScript 7, whose compiler has no JavaScript API, and
`openapi-ts` builds ASTs through that API. The package pins TypeScript 6 through
the `codegen` catalog in `pnpm-workspace.yaml`.

## What the REST generation produces

Under `src/api-client/`:

- `types.gen.ts`: TypeScript types for every entity, request and response. A type
  with the `Writable` suffix (`CustomerWritable`) leaves out the read-only fields
  (`id`, `createdAt`, …), which is what a request body takes.
- `zod.gen.ts`: Zod schemas with the constraints the API declares (`zCustomer`,
  `zCustomerWritable`, …).

  ```typescript
  // app/src/api-client/zod.gen.ts (excerpt)
  export const zLicense = z.object({
      name: z.string().min(1).max(100),
      type: z.enum(['DEVELOPMENT', 'TRIAL', 'PAID', 'COMMUNITY']),
      // ...
  });
  ```

- `@tanstack/react-query.gen.ts`: query keys, query options and mutation options.

  ```typescript
  // app/src/api-client/@tanstack/react-query.gen.ts (signatures only)
  export const listCustomersQueryKey = (options?: Options<ListCustomersData>) => …;
  export const listCustomersOptions = (options?: Options<ListCustomersData>) => …;
  export const createCustomerMutation = (
    options?: Partial<Options<CreateCustomerData>>,
  ): UseMutationOptions<…> => …;
  ```

- `sdk.gen.ts`: one function per operation (`listCustomers`, `createCustomer`, …),
  which the generated query and mutation options call. Call them directly, with
  `throwOnError: true`, when a `queryFn` or `mutationFn` chains several requests.
- `client.gen.ts`, `client/` and `core/`: the `@hey-api/client-fetch` client.
  `src/lib/api/configure-api-client.ts` configures it: the base URL (`env.API_URL`), a
  request interceptor that adds the `Authorization` header, and an error
  interceptor that wraps every failure in an `ApiError`. `main.tsx` imports
  `@/lib/api/bootstrap` once before the route tree so query keys capture the
  configured URL. Adapters have no initialization side effect. See [data-flow.md](./data-flow.md).
- `index.ts`: re-exports the SDK functions and the types.
- `msw.gen.ts`: one Mock Service Worker handler per operation, for the mocks and
  the tests only (`handleListCustomers`, `handleCreateCustomer`, …). The path, the
  path params and the request body come from the operation, and so does the
  response body when the handler is given one rather than a resolver. Each
  matches `*/api/<path>`, whatever origin the client calls.

  ```typescript
  // a story's handlers: the body must be a ListCustomersResponses[200]
  handleListCustomers({ body: { hasMore: false, items: storyCustomers } });
  // the E2E mocks: params.customerSlug is typed, request.json() too
  handleGetCustomer(({ params }) =>
    HttpResponse.json(model.getCustomer(params.customerSlug)),
  );
  ```

Features and domains import the generated code from `@/api-client`,
`@/api-client/@tanstack/react-query.gen` and `@/api-client/zod.gen`. Only the
mocks, the tests and the stories import `@/api-client/msw.gen`.

List endpoints are cursor-paginated. Screens that need a whole list read it
through `@/lib/api/all-pages-query-options`, which keeps the generated query key
and walks every page. See [data-flow.md](./data-flow.md).

## Endpoints outside the contract

An operation that `app/openapi.yaml` does not describe has nothing to generate.
It is wrapped in a `*.api.ts` module inside its feature, with local types, and
moves to the generated client once the contract describes it:

- `features/webhooks/webhooks.api.ts` and `features/demo-sandbox/demo-sandbox.api.ts`
  call the shared client (`client.get`, `client.post`) for `/webhooks*` and
  `/demo/*`;
- `features/notifications/notifications.api.ts` builds the URL of the
  Server-Sent Events stream, which `EventSource` opens by URL.

## Validation schemas

The Zod schemas in `zod.gen.ts` already carry the constraints the API enforces
(lengths, enums, formats). A form starts from the generated schema of its entity
and adapts it.

Extend the generated schema, overriding only what differs: an i18n error message,
a field that exists only in the UI, a stricter rule.

```typescript
// app/src/features/licenses/schemas/license.schema.ts (abridged)
import { z } from 'zod';
import { zLicenseWritable } from '@/api-client/zod.gen';

export const licenseFormSchema = zLicenseWritable
  .pick({ name: true, description: true, type: true, versionName: true })
  .extend({
    name: z.string().min(1, 'Pages.Licenses.Mutation.Form.Errors.name'),
    createAsDraft: z.boolean(),
  });
```

A validation message is a translation key, not a sentence: see [forms](../03-patterns/forms.md#messages-are-i18n-keys).

Use the generated schema as it is when nothing changes:

```typescript
// app/src/features/feature-flags/variants/schemas/variant.schema.ts (abridged)
import { zVariant } from '@/api-client/zod.gen';

export const variantFormSchema = zVariant;
```

For a multi-step form, split the schema with `.pick()`:

```typescript
// app/src/features/feature-flags/schemas/feature-flag.schema.ts (abridged)
export const step2Schema = featureFlagFormSchema.pick({ variants: true });
export const step3Schema = featureFlagFormSchema.pick({ default_variant: true });
```

A schema rewritten with `z.object({ name: z.string().min(1), ... })` repeats
constraints that `zod.gen.ts` already holds (a `max(100)`, an enum) and falls out
of step with the API as soon as it changes. When `zod.gen.ts` exports
`zMyEntityWritable`, the form of `MyEntity` starts from it.

Two cases have no generated schema to start from and use a hand-written one: a
form for an endpoint outside the contract (the webhook form), and a form made of
fields that exist only in the UI (the new license version form). The frames of the
notification stream are declared by hand too, around the generated
`zNotification`.

## Mutations

A generated mutation plugs into `useMutation` by spread. After it succeeds, the
affected queries are invalidated with their generated query keys, or with a helper
that groups several of them:

```typescript
// app/src/features/customers/components/customer-form.mutations.ts (abridged)
const createMutation = useMutation({
  ...createCustomerMutation(),
  onSuccess: async () => {
    await invalidateCustomerQueries(queryClient);
    toast.success(t('Pages.Customers.Mutation.Form.createSuccess'));
  },
});
```

The forms pattern is in [forms.md](../03-patterns/forms.md) and the invalidation
rules are in
[query-key-invalidation.md](../02-conventions/query-key-invalidation.md). The whole
write path is in [data-flow.md](./data-flow.md#write-path).

## GraphQL

GraphQL serves the queries that join several entities (dashboard, lists with
related data). A document is written next to the code that uses it, in a
`*.queries.ts` file, with the `graphql()` function generated in
`src/api-client/graphql/`. `codegen.ts` scans `src/**/*.{ts,tsx}` for those
documents and generates their result types (`documentMode: 'string'`).

```typescript
// app/src/domains/metadata-fields/queries/metadata-fields.queries.ts (abridged)
import { graphql } from '@/api-client/graphql';

export const GET_METADATA_FIELDS = graphql(`
  query MetadataFields($resourceType: MetadataFieldResourceType!, $limit: Int) {
    metadataFields(resourceType: $resourceType, limit: $limit) {
      items { id key label jsonSchema }
      nextCursor
      hasMore
    }
  }
`);
```

Requests go through `graphqlClient.request<Result>(document.toString(), variables)`
from `@/lib/graphql-client`, wrapped in a TanStack Query `queryOptions`:

```typescript
// app/src/domains/metadata-fields/queries/metadata-fields-query-options.ts (abridged)
import type { MetadataFieldsQuery } from '@/api-client/graphql/graphql';
import { graphqlClient } from '@/lib/graphql-client';

const data = await graphqlClient.request<MetadataFieldsQuery>(
  GET_METADATA_FIELDS.toString(),
  { resourceType, limit: MAX_PAGE_SIZE },
);
```

A change to a `.graphqls` file is picked up by `pnpm run generate-graphql`, which
also rewrites `src/api-client/graphql/schema.graphql`. An entity that a screen
loads through both REST and GraphQL needs both query keys invalidated; see
[query-key-invalidation.md](../02-conventions/query-key-invalidation.md).

### A document that needs a scope the screen may not have

The API checks the scopes of a GraphQL document once, for the whole of it, before it
resolves a field: every object type a document selects requires the scope of the
REST operation that serves it, and a document that selects one the caller cannot read
is refused as a whole, with the 403 `Auth.MissingScope` that names the first scope
missing (`api/internal/infrastructure/http/graphql/scope.go`). A field added to a
document that every session sends can therefore take a screen away from the sessions
that lack its scope. When a screen shows data that needs a scope of its own, such as
the subscription of an instance (`Instance.billing`, `read:billing`) or the prices of a
license (`License.prices`, `read:licenses`), it reads it in a **document of its own**,
beside the one it already had, which stays exactly as it was:

- The document is written in a `*.queries.ts` file of the domain or feature that owns the
  data, and takes the same variables as the document it accompanies (`limit`, `cursor`),
  so that one request answers one page of the list and the number of requests follows the
  number of pages, never the number of rows. The query options walk the pages with
  `fetchAllPages`, as the lists do.
- It is sent only when the screen may show it: a hook (`useInstancesBilling`,
  `useLicensesWithPrices` in `@/domains/billing`) reads the capabilities of the feature
  and, when the scope is not the screen's own, the scopes of the session
  (`useCanPerform`), and turns the query off otherwise. A token that does not say which
  scopes it carries is given the benefit of the doubt, as every action is. The screen
  never depends on the answer: a failure leaves it as it was, without the column or the
  line.
- The API keeps a verbatim copy of every document the console sends, with the cost and
  the scopes it pins (`legitimateQueries`, `legitimateVariables` and
  `TestClientDocumentsRequireTheseScopes` in `api/internal/infrastructure/http/graphql/`),
  and `TestLegitimateQueriesHoldEveryConsoleDocument` fails when a document of
  `app/src` has no copy or differs from it. The copy, its variables and its scopes land
  in the same commit as the document; the Go CI starts on any change to a
  `*.queries.ts` file for that reason.
- The enums of a GraphQL type are plain strings there (`status`, `providerKind`,
  `pricingType`, `billingModel`), where the REST contract has enums. The screen checks
  the value against the REST schema (`zInstanceBilling.shape.status`, `zPrice`) before it
  reads it: one it does not know is shown as it was written, neutral, or left out, and
  never fails the screen.
- The mocks refuse such a document as the API does (`GRAPHQL_DOCUMENT_SCOPES`, see
  [integration tests](../06-testing/integration-tests.md)), and answer an empty page by
  default in the unit tests and the stories.

## See also

- [api-contract.md](./api-contract.md): the contract files and where they come from
- [data-flow.md](./data-flow.md): read and write paths, errors, authentication
- [folder-structure.md](./folder-structure.md): the role of `api-client/`
