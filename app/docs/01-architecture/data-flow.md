# Data flow

The console talks to one backend, the Go API, at `env.API_URL` (`VITE_API_URL`, a
URL ending in `/api`). It writes through REST, with the generated client, and
reads through REST or GraphQL. TanStack Query holds every piece of server state.

## Read path

1. The route's `loader` calls `context.queryClient.ensureQueryData(queryOptions)`.
   The data is in the cache before the page renders. The router also preloads a
   route on intent (`defaultPreload: 'intent'`, in `main.tsx`), when the user
   hovers or focuses a link to it.
2. The page component, which lives in a feature, calls
   `useSuspenseQuery(queryOptions)` with the same options and reads the cached
   data.
3. The component renders.

```tsx
// app/src/routes/customers/index.tsx
export const Route = createFileRoute('/customers/')({
  component: CustomersPageContent,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(customersWithInstancesQueryOptions),
});
```

```tsx
// app/src/features/customers/components/customers-page-content.tsx (abridged)
const { data: customers } = useSuspenseQuery(customersWithInstancesQueryOptions);
```

Where the query options come from:

- REST: the generated `listCustomersOptions()` and its siblings
  (`@/api-client/@tanstack/react-query.gen`). List endpoints are cursor-paginated.
  A screen that needs the whole list reads it through `allCustomersOptions()` and
  the other helpers of `@/lib/api/all-pages-query-options`, which keep the
  generated query key and walk every page.
- GraphQL: a `queryOptions` whose `queryFn` calls `graphqlClient.request` with a
  document from a `*.queries.ts` file, as in `customersWithInstancesQueryOptions`.
  See [api-generation.md](./api-generation.md#graphql).

The query client keeps data fresh for 30 seconds (`staleTime` in `main.tsx`), so
the loader and the component do not fetch twice on one navigation.

A route file only assembles: `pnpm run lint` fails on an import of `useMutation`,
`useState` or `useReducer` there (`routes/-components/`, the app shell, may hold
state). See [routes-as-assemblers.md](../03-patterns/routes-as-assemblers.md).

Notifications also arrive over a Server-Sent Events stream
(`use-notification-stream` in `features/notifications`) that refreshes the
notification queries.

## Write path

1. The user submits a form or clicks an action. A hook of the feature calls a
   mutation: `useMutation({ ...createCustomerMutation(), ... })`, spreading the
   options generated for the operation.
2. On success, the mutation invalidates the affected queries with the generated
   query keys, or with a helper that covers several of them, shows a success toast
   and, when it applies, navigates.
3. On failure, it shows an error toast built with `getApiErrorMessage(error)`.
4. The invalidated queries refetch and the screen updates.

```tsx
// app/src/features/customers/components/customer-form.mutations.ts (abridged)
const createMutation = useMutation({
  ...createCustomerMutation(),
  onSuccess: async () => {
    await invalidateCustomerQueries(queryClient);
    toast.success(t('Pages.Customers.Mutation.Form.createSuccess'));
  },
});
```

Deleting from a list can be optimistic: `optimisticDeleteCallbacks`
(`@/lib/optimistic-mutations`) removes the row from the cache, restores it if the
request fails, and invalidates the list when the mutation settles.

The rules for query keys are in
[query-key-invalidation.md](../02-conventions/query-key-invalidation.md), and the
forms that trigger mutations in [forms.md](../03-patterns/forms.md).

## Errors

- REST: the fetch client throws the parsed response body and drops the HTTP
  status. An interceptor in `src/lib/api/index.ts` wraps every failure in an
  `ApiError` that keeps the `status`, the parsed body (the API's `Problem`) and the
  raw `Response`.
- GraphQL: `graphqlClient` throws a `GraphQLRequestError` when the response
  carries `errors`. When the HTTP status is not a success, it throws the same
  `ApiError` if the body is a `Problem` (the API refused the request), and a plain
  `Error` otherwise.
- `@/lib/errors` turns either into something to show: `getApiErrorMessage` returns
  the user-facing message, and `handleApiError` returns a normalized `AppError`
  and logs it. [error-handling.md](../02-conventions/error-handling.md) has the
  patterns.

## Authentication

The console only attaches a credential to its requests. Verifying it and
authorizing the request are the gateway's and the API's job; see
[Authentication](../../../README.md#authentication) in the README.

How the console obtains a credential depends on three build-time variables that
`main.tsx` reads:

| Mode | Selected by | Behaviour |
| --- | --- | --- |
| Local accounts | `VITE_LOCAL_AUTH=true` | `LocalAuthGate` shows a picker of dev accounts (organization, then user) before the app. The chosen token is stored in `localStorage` (`kaiten_dev_token`) |
| Clerk | neither of the other two | `ClerkProvider` wraps the app; a signed-out visitor is redirected to sign-in. Needs `VITE_CLERK_PUBLISHABLE_KEY` |
| No sign-in | `VITE_E2E_BYPASS_AUTH=true` | The app renders without signing in. Playwright's app suite uses it, with mocked API responses (`VITE_E2E_MSW`) |

`VITE_LOCAL_AUTH` wins if several are set. `app/.env.example` lists the variables.

Local accounts come from the stack: the `tokens` service of `compose.yml`, started
by `task up`, `task dev` and `task quickstart`, signs one token per seeded user
into `dev/tokens.json`, and the Vite dev server serves that file to the picker
(`virtual:dev-tokens`). `task app` and `task dev` start the console with
`VITE_LOCAL_AUTH=true`; `LOCAL_AUTH=false` switches them to Clerk.

`getAuthToken()` (`src/lib/auth-token.ts`) resolves the token for each request:

1. with `VITE_LOCAL_AUTH=true`, the stored dev token;
2. otherwise the Clerk session token;
3. otherwise the `__session` cookie.

The REST client's request interceptor sets `Authorization: Bearer <token>`, or
removes the header when there is no token, and `graphqlClient` sends the same
header.

The notification stream is the exception. `EventSource` cannot set a header, so
the stream authenticates with the `__session` cookie and is opened with
`withCredentials`. In Clerk mode Clerk sets that cookie; with local accounts,
picking a dev token also writes it (`src/lib/local-auth.ts`).
