# Routes as assemblers

A route connects a URL to a screen. It loads the data, reads its params and search params, and renders one feature component. Everything else belongs to the feature under `app/src/features/`.

The principle is in [AI_CONTEXT.md](../AI_CONTEXT.md#principles), and the imports a route may use are in [Import rules](../AI_CONTEXT.md#import-rules). Lint refuses importing `useMutation`, `useState` or `useReducer` in a route file (`routes/-components/`, the app shell, may keep state); the rest of the principle is checked in review. This page shows what a route file looks like.

## What a route contains

| Concern | Where it lives |
| --- | --- |
| The URL, the params, the search params | The route: the path in `createFileRoute`, `Route.useParams()`, `validateSearch` |
| Preloading the data | The route `loader`, with `ensureQueryData` |
| The page title in the breadcrumbs | The route `beforeLoad`, which returns `getTitle` |
| The main query | The route: `ensureQueryData` in the loader, `useSuspenseQuery` in the component |
| Secondary queries | The feature: hooks and components |
| Mutations and business logic | The feature: hooks first, components when needed |
| UI state (dialogs, tabs, selection) | The feature: a store, or `useState` in a component |
| Reshaping API data | Hooks and utilities of the feature |
| Detailed JSX | Components of the feature |

The customer detail route renders `CustomerDetailPageContent`. The delete mutation, the filtering of the customer's instances and the page markup are in `app/src/features/customers/components/customer-detail/customer-detail-page-content.tsx`, not in `app/src/routes/customers/$customerSlug/route.tsx`.

## The route lifecycle

On each URL change the router (TanStack Router) runs, in this order:

1. **Matching.** The params are parsed and `validateSearch` runs, from the parent route down.
2. **`beforeLoad`**, in series, parent first. It can add to the route context.
3. **Loading, in parallel.** The code of the route component is preloaded and the `loader`s run. If a loader takes longer than the router's pending delay (one second by default), `pendingComponent` is shown.

In this app:

- `beforeLoad` enriches the context, typically with the title of the breadcrumb, which `app/src/routes/-components/path-breadcrumbs/` reads.
- `loader` preloads with `ensureQueryData`, which returns at once when the query is already in the cache.
- The component reads with `useSuspenseQuery` and passes the result to a feature component.

Without the preload, the data would load when the component renders, which means a loading state and request waterfalls. With `ensureQueryData` in the loader, the data is ready before the first render. Links also preload the loader of their target when hovered or focused (`defaultPreload: 'intent'` in `app/src/main.tsx`). The [TanStack Router data loading guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading) describes the mechanism.

## Examples

### A list

```tsx
// app/src/routes/licenses/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import {
  LicensesPageContent,
  licenseFamiliesQueryOptions,
  licensesWithInstancesQueryOptions,
} from '@/features/licenses';

export const Route = createFileRoute('/licenses/')({
  component: LicensesPageContent,
  loader: ({ context }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(licensesWithInstancesQueryOptions),
      context.queryClient.ensureQueryData(licenseFamiliesQueryOptions),
    ]);
  },
});
```

The route preloads two queries in parallel. The page component reads them itself.

### A detail page: `beforeLoad` and several queries

```tsx
// app/src/routes/licenses/$licenseSlug/route.tsx (abridged)
export const Route = createFileRoute('/licenses/$licenseSlug')({
  component: LicenseDetailRouteLayout,
  validateSearch: (search) => licenseDetailSearchSchema.parse(search),
  beforeLoad: async ({ context, params: { licenseSlug } }) => {
    const license = await context.queryClient.ensureQueryData(
      licenseQueryOptions(licenseSlug),
    );
    return { getTitle: () => license.name };
  },
  loader: ({ context, params: { licenseSlug } }) =>
    context.queryClient.ensureQueryData(licenseQueryOptions(licenseSlug)),
});

function LicenseDetailRouteLayout() {
  const { licenseSlug } = Route.useParams();
  const { copyFrom, mode } = Route.useSearch();
  const { data: license } = useSuspenseQuery(licenseQueryOptions(licenseSlug));

  return (
    <LicenseDetailPage
      copyFrom={copyFrom}
      license={license}
      licenseSlug={licenseSlug}
    >
      {/* the commercial dialog while `mode` is `configure` */}
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </LicenseDetailPage>
  );
}
```

```tsx
// app/src/routes/licenses/$licenseSlug/index.tsx: the Overview tab loads its own queries
export const Route = createFileRoute('/licenses/$licenseSlug/')({
  component: LicenseOverviewRoute,
  loader: async ({ context, params: { licenseSlug } }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        licenseEntitlementsQueryOptions(licenseSlug),
      ),
      context.queryClient.ensureQueryData(entitlementsQueryOptions),
    ]);
  },
});
```

`beforeLoad` runs before the loader and gives the breadcrumb its title; its `ensureQueryData` fills the cache, so the loader's call returns at once and the component reads the same query with `useSuspenseQuery`. The layout loads the version, which its title and its tabs need, and passes the search parameters it declares to the page as props. Each tab loads what it shows itself, in parallel with the code splitting of its component: a tab whose data the session may not read, or that exists only where billing does, never blanks the page around it.

A loader that only warms a query the page reads without suspending, because the page has the states for it (a skeleton, the refusal with a Retry, an empty state), calls `prefetchQuery` or `prefetchInfiniteQuery` instead of `ensureQueryData`: a prefetch never throws, so a refusal does not replace the page by the error component of the route. The page shows it, with the screen around it intact. The reports behind an invoice line, in `app/src/routes/billing/`, do it, and their query options set `retryOnMount: false` so that the page shows the refusal the loader met instead of asking once more behind it. A record the page cannot show without (an invoice) is still `ensureQueryData`, and a refusal of it is the `errorComponent` of the route.

### A detail page with tabs

A detail page with tabs is a layout route (`route.tsx`) that renders the page around an `<Outlet />`, and one file per tab beside it:

```txt
routes/releases/$releaseSlug/
├── route.tsx                # loads the release, renders ReleaseDetailPageContent around <Outlet />
├── index.tsx                # Overview tab
├── deployment-zones.tsx     # Deployment zones tab
└── deploy.tsx               # dialog route, see dialog-via-route.md
```

```tsx
// app/src/routes/releases/$releaseSlug/route.tsx (abridged)
export const Route = createFileRoute('/releases/$releaseSlug')({
  component: ReleaseDetailRouteLayout,
  beforeLoad: async ({ context, params: { releaseSlug } }) => {
    const release = await context.queryClient.ensureQueryData(
      releaseQueryOptions(releaseSlug),
    );

    return { getTitle: () => release.version };
  },
  loader: ({ context, params: { releaseSlug } }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(releaseQueryOptions(releaseSlug)),
      // …the other queries of the page
    ]);
  },
});

function ReleaseDetailRouteLayout() {
  const { releaseSlug } = Route.useParams();
  const { data: release } = useSuspenseQuery(releaseQueryOptions(releaseSlug));

  return (
    <ReleaseDetailPageContent release={release} releaseSlug={releaseSlug}>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </ReleaseDetailPageContent>
  );
}
```

```tsx
// app/src/routes/releases/$releaseSlug/index.tsx
export const Route = createFileRoute('/releases/$releaseSlug/')({
  component: ReleaseDetailOverviewRoute,
});

function ReleaseDetailOverviewRoute() {
  return <ReleaseDetailOverviewTab />;
}
```

A tab route gives its breadcrumb a title with `beforeLoad` too, using the i18n instance: see `app/src/routes/feature-flags/$featureFlagSlug/variants.tsx`.

### A creation page

```tsx
// app/src/routes/feature-flags/new/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { FeatureFlagForm } from '@/features/feature-flags';

export const Route = createFileRoute('/feature-flags/new/')({
  component: RouteComponent,
});

function RouteComponent() {
  return <FeatureFlagForm />;
}
```

The mutation, the validation and the navigation after the submit are all in `FeatureFlagForm`.

### A route that exists only where a capability says so

A route can depend on what the deployment ships: billing exists only where `GET /billing/capabilities` says so. Its guard is a `beforeLoad` that reads the capability from the cache. Where the capability is there, the route loads. Where it is not, the guard throws `notFound({ data })` with the reason, and the route's `notFoundComponent` renders an explanation in place of the screen: a link to a screen that is not there explains why instead of failing or sending the person elsewhere. The same `notFoundComponent` answers a path under the layout that is no page.

```tsx
// app/src/routes/invoices/route.tsx (abridged)
export const Route = createFileRoute('/invoices')({
  component: InvoicesLayout,
  notFoundComponent: BillingNotFound,
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient);
  },
});

function InvoicesLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
```

The guard throws because a `beforeLoad` that returns lets the `beforeLoad` and the `loader` of every route below it run, whatever it put in the route context. A screen under a closed gate would ask the API for data that is not there. A throw stops them all, and only the capabilities are requested. A `notFound` that carries `data` is a not-found the route explains itself, so the tab title keeps the title of the trail instead of reading "Page not found" (`isNotFoundPage` in `app/src/routes/-components/path-breadcrumbs/breadcrumb-items.ts`).

`requireBillingCapability` and `BillingNotFound` come from `@/domains/billing`, and the guard fails closed: see [billing](../../src/domains/billing/README.md). A route that guards on a platform flag instead (`routes/integrations/webhooks/route.tsx`) answers with the plain not-found page.

### Search parameters and edit dialogs

A route declares the search parameters it accepts with `validateSearch`, and passes them to the feature as props. `app/src/routes/notifications/index.tsx` and `app/src/routes/feature-flags/index.tsx` do it for a status filter and a view mode, and `app/src/routes/invoices/index.tsx` for a view that reads another operation: its `loaderDeps` name the view and the part of the search that view reads, and its `loader` warms the query of that view only; see [URL state](./state-management.md#url-state). The edit mode of a detail page (`?mode=configure`) and the routes that render a dialog are in [dialog via route](./dialog-via-route.md).

## Layout routes and Suspense

A `route.tsx` file has no URL segment of its own: it is the layout of the routes beside it. Wrap the `<Outlet />` in `<Suspense fallback={null}>`: a child route that suspends, such as a dialog reading a query, then does not blank the page around it. A layout route often carries the loader that preloads the data of the page, so that a dialog opens on a page that is already loaded. See [dialog via route](./dialog-via-route.md#avoiding-a-flash).

## Errors and not-found

A route does not declare its own `errorComponent`, with one exception below. `createRouter` in `app/src/main.tsx` sets the defaults for every route:

- `defaultErrorComponent` renders `RouteError` (`app/src/components/route/route-error.tsx`). An error that is an API 404 (a missing entity) shows the not-found page, and one that is an API 403 (a read the session is refused) the restricted-access page. Any other error shows a card with the message, a "Go Home" button and a "Try Again" button that runs `router.invalidate()`, which reloads the loaders and resets the error boundary.
- `defaultNotFoundComponent` renders `NotFound`. It answers a URL that matches no route and a loader that throws `notFound()`, as the deployment zone edit route does for an unknown slug.
- `defaultPendingComponent` renders `RoutePending`.

A route that needs its own boundary sets `errorComponent`. It can render `RouteError`, which takes an `error` and an optional `reset`, or a component of its own when the default card says too little. The routes of the invoices, whose list also reads the handoff queue as one of its views, and of the vouchers do (`app/src/routes/invoices/$invoiceId/route.tsx`, `app/src/routes/invoices/index.tsx` and, for the guard, the list, a voucher and the wizard, `app/src/routes/vouchers/`): a refusal of the billing API carries a `detail` in its own words and a trace id that the person needs, so they set `BillingRouteError` (`app/src/domains/billing/components/billing-route-error.tsx`), which renders `NotFound` for a 404 and the refusal with a Retry for anything else. A route that reads one record for a screen that has states of its own (a skeleton, a refusal with a Retry, an empty state) does not need a boundary at all: it prefetches, as [A detail page: `beforeLoad` and several queries](#a-detail-page-beforeload-and-several-queries) describes.

## Tests

Route files are excluded from unit-test coverage (`**/routes/**` in `app/vite.config.ts`). Their behaviour is exercised through the stories and unit tests of the feature components they render and through the Playwright suite in `app/e2e/`. See [integration tests](../06-testing/integration-tests.md).

A route that keeps logic worth a unit test is better split: move the logic into the feature. When a helper stays next to the route, a test file whose name starts with `-` is ignored by the router, as in `app/src/routes/customers/$customerSlug/-edit.test.ts`.
