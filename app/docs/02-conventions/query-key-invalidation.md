# Query key invalidation

TanStack Query holds the server state of the console. After a mutation, the screens
that show the changed data refetch because the mutation invalidates their queries by
key. This page says how keys are written and matched, which queries have no generated
key, and which helpers invalidate a group of queries. The whole write path is in
[data flow](../01-architecture/data-flow.md).

## Invalidate with a generated key

Use the key functions generated from the OpenAPI contract, exported by
`@/api-client/@tanstack/react-query.gen`. Do not write a key by hand.

```ts
import { listDeploymentZonesQueryKey } from '@/api-client/@tanstack/react-query.gen';

queryClient.invalidateQueries({ queryKey: listDeploymentZonesQueryKey() });
```

A hand-written key such as `['deployment-zones']` matches nothing: the queries are not
stored under it, and the invalidation fails silently. The table that does not refresh
after a mutation is the symptom.

A generated key is a one-element array that holds an object:

```ts
[{ _id: 'getLicense', baseUrl, path: { licenseSlug: 'starter' } }]
```

`_id` is the operation, `baseUrl` the client's base URL, and `path`, `query`, `body`
and `headers` appear only when the call has them. TanStack Query matches a key by
prefix and partially, so an invalidation reaches every cached query whose key
contains what the filter contains:

- `listReleasesQueryKey()` matches every cached release list, whatever `query` (cursor,
  limit) it was fetched with.
- `getLicenseQueryKey({ path: { licenseSlug } })` matches that license only.
- `[{ _id }]` matches every call of one operation. `invalidateLicenseDetails`
  (`app/src/features/licenses/queries/license-query-options.ts`) uses it to refresh the
  detail of every license, taking `_id` from the generated function so that the
  operation name is not typed again:

```ts
const [{ _id }] = getLicenseQueryKey({ path: { licenseSlug: '' } });
await queryClient.invalidateQueries({ queryKey: [{ _id }] });
```

`useEntitlementFormMutations` (`app/src/features/entitlements/hooks/`) reaches the same
goal with a `predicate` on `_id` for the entitlements of every license.

## Names of the generated functions

Every query operation generates `<name>QueryKey` and `<name>Options`, every mutation
generates `<name>Mutation`, and paginated operations also generate
`<name>InfiniteQueryKey` and `<name>InfiniteOptions`. `<name>` is the operation id in
`app/openapi.yaml`, in camel case. The ids are not uniform: the list of licenses is
`get-licenses`, so its key is `getLicensesQueryKey`, and the list of customers is
`list-customers`, so its key is `listCustomersQueryKey`. Read the exports instead of
guessing, after `pnpm run generate` (the file is git-ignored):

```bash
grep "^export const .*QueryKey =" app/src/api-client/@tanstack/react-query.gen.ts
```

The options of a list key are optional, so `listReleasesQueryKey()` covers the whole
list. A detail key requires `path`, and TypeScript rejects another shape.

| Reads | Key function |
| --- | --- |
| The list of releases | `listReleasesQueryKey()` |
| The list of licenses | `getLicensesQueryKey()` |
| The list of feature flags | `getFeatureFlagsQueryKey()` |
| The list of service accounts | `getServiceAccountsQueryKey()` |
| One customer | `getCustomerQueryKey({ path: { customerSlug } })` |
| One release | `getReleaseBySlugQueryKey({ path: { releaseSlug } })` |
| One deployment zone | `getDeploymentZoneBySlugQueryKey({ path: { deploymentZoneSlug } })` |
| One feature flag | `getFeatureFlagQueryKey({ path: { featureFlagSlug } })` |
| One instance | `getInstanceQueryKey({ path: { instanceSlug } })` |
| The entitlements of a license | `getLicenseEntitlementsQueryKey({ path: { licenseSlug } })` |

The API addresses a resource by its slug, so its path parameters are `customerSlug`,
`licenseSlug`, `featureFlagSlug` and so on, not an id. Only the metadata fields
(`/metadata-fields/{id}`) still take one.

## Lists are pages

A cursor-paginated list endpoint answers a page, `{ items, hasMore, nextCursor }`
(`PageRelease`, `PageDeploymentZone`, ...), and the query cache holds that page. Code
that reads or writes a cached list works on `items`, not on an array.

A screen that needs the whole list (to search, sort and page on the client) reads it
through `all<Entity>Options()` from `app/src/lib/api/all-pages-query-options.ts`, such
as `allReleasesOptions()` or `allCustomersOptions()`. Each spreads the generated options
and replaces only the `queryFn` with one that walks every page
(`app/src/lib/api/pagination.ts`), so the query keeps its generated key and
`listReleasesQueryKey()` still invalidates it. The cache then holds
`{ hasMore: false, items }` with every row.

The page walker validates the envelope (`items` array and boolean `hasMore`),
requires a non-empty cursor when more pages remain, and refuses any visited
cursor. A malformed response is a protocol error, never an empty list or a
silently truncated list. Pass the query's `signal` to both the walker and the
transport. GraphQL's `request(query, variables, signal)` forwards it to fetch;
cancellation stops the walk and TanStack Query handles it as cancellation,
rather than a normal business error.

## Queries without a generated key

GraphQL queries, and queries that combine several requests, have no generated key.
Export the key next to the query options as a `*BaseQueryKey` constant, and invalidate
through that constant.

```ts
// app/src/domains/customer-management/queries/use-customers-with-instances.ts (abridged)
export const customersWithInstancesBaseQueryKey = [
  'customers',
  'with-instances',
] as const;

export const customersWithInstancesQueryOptions = queryOptions({
  queryKey: customersWithInstancesBaseQueryKey,
  queryFn: async () => { /* walks every page of the GraphQL list */ },
});
```

Other examples are `instancesWithRelationsBaseQueryKey`
(`app/src/domains/customer-management/queries/`), `licensesWithInstancesBaseQueryKey`
(`app/src/features/licenses/queries/`) and `webhooksBaseQueryKey`
(`app/src/features/webhooks/queries/`). The dashboard's main query, `useDashboardData`
(`app/src/features/dashboard/queries/use-dashboard-data.ts`), uses the literal key
`['dashboard']`, which no mutation invalidates. Export a key for it before
invalidating it.

## Entities read through REST and GraphQL

An entity that a screen reads through both REST and GraphQL has two sets of queries,
and a mutation invalidates both. The customers of the list come from the GraphQL
query above, which adds each customer's instance count and license types, and the
detail comes from REST. `invalidateCustomerQueries` covers the three:

```ts
// app/src/domains/customer-management/queries/customer-query-invalidation.ts
export async function invalidateCustomerQueries(
  queryClient: QueryClient,
  customerSlug?: string,
) {
  const invalidations: Array<Promise<void>> = [
    queryClient.invalidateQueries({ queryKey: listCustomersQueryKey() }),
    queryClient.invalidateQueries({
      queryKey: customersWithInstancesQueryOptions.queryKey,
    }),
  ];

  if (customerSlug) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: getCustomerQueryKey({ path: { customerSlug } }),
      }),
    );
  }

  await Promise.all(invalidations);
}
```

## Helpers for a group of queries

When a mutation affects several queries, write one helper per entity that invalidates
them, and call it from every mutation of that entity: a query added later is then
invalidated in one place. Helpers live in the `queries/` folder of their feature or
domain, usually in a `*-query-invalidation.ts` file (the license helpers sit in
`license-query-options.ts`), and take the `QueryClient` and, when a detail exists, its
slug:

| Helper | Invalidates |
| --- | --- |
| `invalidateCustomerQueries(queryClient, customerSlug?)` | The customers, in REST and GraphQL, and the customer's detail |
| `invalidateInstancesListQueries(queryClient)`, `invalidateInstanceQueries(queryClient, instanceSlug)` | The instances, in REST and GraphQL, the customers that derive from them, and the instance's detail |
| `invalidateReleaseQueries(queryClient, releaseSlug?)` | The releases, components and deployment zones, the release overview, and the release's detail |
| `invalidateLicenseQueries(queryClient, licenseSlug?)` | The license lists and families, the license's detail and entitlements, then refetches them |
| `invalidateWebhookQueries(queryClient)`, `invalidateNotificationFeedQueries(queryClient)`, `invalidateAttioQueries(queryClient)` | The webhooks, the notification feed and the Attio connector |
| `invalidateInstanceBillingQueries(queryClient, instanceSlug)`, `invalidateInvoiceQueries(queryClient, invoiceId?)`, `invalidateLicensePriceQueries(queryClient, licenseSlug)`, `invalidateBillingSettingsQueries(queryClient)` | An instance's subscription, upcoming invoice and invoices (and the instance itself), the invoices and the handoff queue, the prices of a license version, the billing settings and capabilities |

They live in `app/src/domains/customer-management/queries/`,
`app/src/features/releases/queries/`, `app/src/features/licenses/queries/`,
`app/src/features/webhooks/queries/`, `app/src/features/notifications/queries/`,
`app/src/features/connectors/attio/queries/` and `app/src/domains/billing/queries/`.

Some release-area mutations invalidate keys directly instead of calling
`invalidateReleaseQueries`. The deployment-zone hooks in
`app/src/features/deployment-zones/hooks/` invalidate `listDeploymentZonesQueryKey()`
and repeat `releaseManagementOverviewBaseQueryKey` by hand, and the component form
(`app/src/domains/release-management/component-catalog/hooks/use-component-form.ts`)
invalidates `listComponentsQueryKey()`. New code calls the helper.

A helper that several features need lives in a domain, because a feature cannot import
another feature (see [import rules](../AI_CONTEXT.md#import-rules)). The customers'
rows derive from instances, so a mutation of an instance also refreshes them:
`invalidateInstancesListQueries` calls `invalidateCustomerQueries`. The instances and
connectors features import these helpers from `@/domains/customer-management`.

## After a mutation

A mutation invalidates in `onSuccess`, awaits the invalidation, then shows the toast
and navigates. Returning a promise from `onSuccess` keeps the mutation pending until the
refetch of the active queries ends, so a submit button stays disabled and the next
screen does not open on stale data.

```ts
// app/src/features/service-accounts/hooks/use-service-accounts-mutations.ts (abridged)
const invalidateServiceAccounts = async (
  queryClient: QueryClient,
  serviceAccountSlug?: string,
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: getServiceAccountsQueryKey() }),
    serviceAccountSlug
      ? queryClient.invalidateQueries({
          queryKey: getServiceAccountQueryKey({ path: { serviceAccountSlug } }),
        })
      : undefined,
  ]);
};

useMutation({
  ...deleteServiceAccountTokenMutation(),
  onSuccess: async (_data, { path }) => {
    await invalidateServiceAccounts(queryClient, path.serviceAccountSlug);
    toast.success(t('Pages.Integrations.ServiceAccounts.Token.revokeSuccess'));
  },
  onError: handleMutationError,
});
```

The slug comes from the `variables` of the mutation, second argument of `onSuccess`.
Showing the error is covered in [error handling](./error-handling.md).

- A mutation can also write its response into the cache with `setQueryData`, so the
  screen updates before the refetch returns. `useEntitlementFormMutations` prepends
  the new entitlement to the cached list, then invalidates the list.
- Callbacks passed to `useMutation` run before those passed to `mutate(variables, { ... })`,
  and the latter do not run if the component has unmounted.
- A delete can update the list before the server answers. See
  [optimistic delete](./error-handling.md#optimistic-delete).

## After a delete: forget the detail

Invalidating the detail query of an entity that the server has just deleted refetches
a row that no longer exists. The API answers 404, and React Query retries the fetch
three times with backoff before it fails. For customers and instances, the delete
removes the detail from the cache and invalidates only the lists:
`forgetDeletedCustomerQueries` and `forgetDeletedInstanceQueries` in the domain's
`queries/` folder.

Call one of them only once nothing observes the detail any more. Removing a query that
still has an observer only makes it fetch the deleted row again on the next render.
The customer detail page
(`app/src/features/customers/components/customer-detail/customer-detail-page-content.tsx`)
navigates to `/customers` first, then calls `forgetDeletedCustomerQueries`.
