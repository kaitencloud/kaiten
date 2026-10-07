# Error handling

A failed request reaches the user in one of three ways: the router's error page, a
toast, or a message next to the control that caused it. This page describes how an
error becomes a message, which of the three each kind of failure uses, and who is
responsible for showing the error of a mutation.

## From a failed request to a message

**REST.** The generated fetch client throws the parsed response body and drops the
HTTP status. An interceptor in `app/src/lib/api/configure-api-client.ts` wraps every failure in an
`ApiError` (`app/src/lib/errors/api-error.ts`), which keeps:

- `status`: the HTTP status, `undefined` when there was no response (a network
  failure);
- `data`: the parsed body, normally the API's `Problem` (`title`, `detail`, `errors`);
- `response`: the raw `Response`, when there is one.

The `message` of an `ApiError` is `Request failed with status 409`. It is for
debugging, never for the user.

**GraphQL.** What `graphqlClient.request` (`app/src/lib/graphql-client.ts`) throws
depends on the response:

- An `ApiError`, when the HTTP status is not a success and the body is a `Problem`.
  The API answers this way when it refuses the request: 401 when the request carries
  no identity, 403 for the wrong kind of credential or for a missing scope. The
  `detail` of a missing scope reads `missing required scope: read:customers`. The
  error has the same `status`, `data` and `response` as for REST, so what this page
  says of an `ApiError` holds for both clients.
- A plain `Error`, `GraphQL request failed with status 502`, when the HTTP status is
  not a success and the body is not a `Problem`: the HTML or text error of a gateway,
  or JSON of another shape.
- A `GraphQLRequestError`, which has an `errors` array, when the status is a success
  and the response contains errors.

**Message.** `@/lib/errors` (`app/src/lib/errors/`) turns any thrown value into text:

| Export | Use |
| --- | --- |
| `getApiErrorMessage(error, t?)` | The function to call. Takes whatever was thrown and returns the text to show. |
| `handleApiError(error, t?)` | What `getApiErrorMessage` calls. Returns an `AppError` (`code`, `message`, `status`, `details`, `originalError`) and logs it. |
| `mapApiError(error, t?)`, `getErrorMessage(appError, t?)` | The two steps of `getApiErrorMessage` for an `ApiError`, without the log: the first returns the `AppError`, the second its message, or `Errors.api.<code>` when it has none. For code that runs on every render. |
| `isApiError(error)`, `isNotFoundError(error)`, `isForbiddenError(error)` | A type guard, a 404 check and a 403 check, for the few places that branch on the status. |

`getApiErrorMessage` picks the message like this:

| Thrown value | Message |
| --- | --- |
| `ApiError` without `status` (no response) | `Errors.api.NETWORK` |
| `ApiError` with a `Problem` body | the `detail`, else the `title`, else `Errors.api.<code>` |
| `ApiError` with a string body | the string |
| any other `ApiError` | `Errors.api.<code>` |
| GraphQL errors | their messages, joined with `; ` |
| `Error` | its `message` |
| anything else | `Errors.api.UNKNOWN` |

`<code>` comes from the status: 400 `VALIDATION`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`,
404 `NOT_FOUND`, 409 `CONFLICT`, 429 `RATE_LIMITED`, 500, 502, 503 and 504
`SERVER_ERROR`, any other status `UNKNOWN`. The codes are listed in
`app/src/lib/errors/types.ts`, and `pnpm run check:api-error-i18n` fails when one has
no `Errors.api.<code>` translation. Text written by the server is shown as is: only
the generic `Errors.api.*` messages follow the active language.

Every call to `handleApiError` is logged with `logger.error`
(`app/src/lib/logger.ts`), which prints to the browser console in development. No
error-reporting service is wired.

## Where the error is shown

| Failure | Shown by |
| --- | --- |
| A route loader or a suspense query fails | The router's error component, `RouteError` |
| A mutation fails | A toast |
| An input cannot be sent or is refused before the request | A message next to the field |

**Route errors.** `main.tsx` sets `RouteError` (`app/src/components/route/route-error.tsx`)
as the router's `defaultErrorComponent`, and only one route overrides it: the billing
route of one invoice, which shows the billing API's refusal in its own words with
`BillingRouteError` (see [Billing refusals](#billing-refusals)). What `RouteError` renders
depends on what was thrown:

| Thrown value | Rendered |
| --- | --- |
| `ApiError` with status 404 (`isNotFoundError`) | `NotFound`: a missing entity is not worth a retry. |
| `ApiError` with status 403 (`isForbiddenError`) | `RestrictedAccess` (`app/src/components/route/restricted-access.tsx`): "Restricted access", the `detail` of the problem when it has one (`missing required scope: read:customers`) and a "Go Home" link. It has no "Try Again": asking again gets the same answer. |
| anything else | The error card: a message, "Try Again" (invalidates the router) and "Go Home" buttons, and the stack in development. |

On the card, an `ApiError` shows the `detail` of its problem, else the `title`, else
`Errors.api.<code>`, and `Errors.api.NETWORK` when it has no `status`. That is what
`getApiErrorMessage` returns for it, with one difference: a body that is not a problem
is never printed. It is the text or the HTML page of a gateway, so the card shows
`Errors.api.<code>` where `getApiErrorMessage` returns the string. `RouteError` reads
the message with `mapApiError` and `getErrorMessage`, because `getApiErrorMessage` and
`handleApiError` log on every call and a component renders more than once. Any other
`Error` shows its `message`, and a thrown string is shown as is.

Only an `ApiError` has a status to branch on. The GraphQL client throws one when the
API refuses a request (see **GraphQL** above), so a page read over GraphQL without the
scope it needs shows `RestrictedAccess`, like a REST loader. A plain `Error`, such as
the `GraphQL request failed with status 502` of a gateway, shows the error card with its
message.

**Toasts.** Import `toast` from `sonner`. The `Toaster` is mounted once, in
`app/src/routes/__root.tsx`, through the wrapper `app/src/components/ui/sonner.tsx`.

## Mutations: who shows the error

The `QueryClient` in `main.tsx` sets only a `staleTime`. It has no `QueryCache` or
`MutationCache` error handler, so a failed mutation shows nothing unless the code that
runs it does. There are three ways to show it.

**In a form: `try`/`catch` around `mutateAsync`.** `mutateAsync` rejects with the
error, and the submit handler shows it. The `onSuccess` of the mutation invalidates
the cache and shows the success toast; the handler decides what happens next.

```ts
// app/src/features/customers/components/customer-form.tsx (abridged: the update branch is left out)
const form = useAppForm({
  defaultValues,
  onSubmit: async ({ value }) => {
    try {
      const savedCustomer = await createMutation.mutateAsync({
        body: customerFormValuesToCreateBody(value),
      });
      handleSuccess(savedCustomer);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    }
  },
});
```

**Outside a form: `onError` on the mutation.** For a button, a switch or a table
action, `mutate` never throws, so the error goes to `onError`.

```ts
// app/src/features/service-accounts/hooks/use-service-accounts-mutations.ts (abridged)
const handleMutationError = (error: unknown) => {
  toast.error(getApiErrorMessage(error));
};

function useDeleteTokenMutation(queryClient: QueryClient, t: TFunction) {
  return useMutation({
    ...deleteServiceAccountTokenMutation(),
    onSuccess: async (_data, { path }) => {
      await invalidateServiceAccounts(queryClient, path.serviceAccountSlug);
      toast.success(t('Pages.Integrations.ServiceAccounts.Token.revokeSuccess'));
    },
    onError: handleMutationError,
  });
}
```

**In the page: render `mutation.error`.** The Try it dialog of a feature flag
(`app/src/features/feature-flags/components/try-it-dialog.tsx`) evaluates a flag with a
mutation and shows `getApiErrorMessage(evalError)` in the dialog, beside the result,
instead of a toast.

Pick one of the first two patterns for a mutation, not both: a mutation with an
`onError` whose caller also catches the error of `mutateAsync` shows two toasts.

Rules:

- Show the message from `getApiErrorMessage(error)`. The server says why an action
  failed (a slug is taken, a resource is still referenced), and the user needs that
  reason. Never `(error as Error).message`: on an `ApiError` it reads
  `Request failed with status 409`.
- Optimistic deletes show a fixed translated message instead (see below).
- A shared component can do it for the callback it receives: `EditableTitle`
  (`app/src/functionals/page/editable-title.tsx`) catches the error of its `onSave`
  and shows a toast, so a rename that awaits `mutateAsync` needs no `catch` of its own.
- User-visible text goes through i18n, never a string literal in the component. See
  [i18n](./i18n.md).
- Do not swallow the error of a mutation: an empty `catch` leaves the user without
  feedback.
- A `queryFn` or `mutationFn` that calls an SDK function directly passes
  `throwOnError: true`. Without it the function returns `{ error }` instead of
  throwing, and the failure never reaches `onError` or the `catch`. The generated
  `*Mutation()` and `*Options()` functions set it already. See
  [API generation](../01-architecture/api-generation.md).
- A refusal often means the screen is stale. `useLicenseLifecycleTransition`
  (`app/src/features/licenses/hooks/use-license-lifecycle-transition.ts`) shows the
  API's reason in `onError` and invalidates the license so that it is refetched.

## Optimistic delete

A delete from a list can remove the row from the cache before the server answers,
restore it if the request fails, and resynchronise when the mutation settles. The
cached list is a page, `{ items, hasMore, nextCursor }`, so the update goes through
`items` and rows are matched by `slug`.

```ts
// app/src/features/deployment-zones/hooks/use-delete-deployment-zone-mutation.ts (abridged)
return useMutation({
  ...deleteDeploymentZoneMutation(),
  onMutate: async () => {
    // Stop refetches that would overwrite the optimistic list.
    await queryClient.cancelQueries({
      queryKey: listDeploymentZonesQueryKey(),
    });
    const previousZones = queryClient.getQueryData(
      listDeploymentZonesQueryKey(),
    );

    queryClient.setQueryData<PageDeploymentZone | undefined>(
      listDeploymentZonesQueryKey(),
      (old) => {
        if (!old) {
          return old;
        }
        return {
          ...old,
          items: old.items.filter((zone) => zone.slug !== deploymentZone.slug),
        };
      },
    );

    return { previousZones };
  },
  onError: (_error, _variables, context) => {
    if (context?.previousZones) {
      queryClient.setQueryData(
        listDeploymentZonesQueryKey(),
        context.previousZones,
      );
    }
    toast.error(t('Features.Releases.deleteZoneError'));
  },
  onSuccess: () => {
    toast.success(t('Features.Releases.Success.zoneDeleted'));
  },
  onSettled: async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: listDeploymentZonesQueryKey(),
      }),
      // The release overview also shows the zones.
      queryClient.invalidateQueries({
        queryKey: releaseManagementOverviewBaseQueryKey,
      }),
    ]);
  },
});
```

`optimisticDeleteCallbacks` (`app/src/lib/optimistic-mutations.ts`) packages the same
steps and both toasts. It takes the list key, the `id` of the row and the two
messages, and it accepts a bare array or a `{ items }` page. It matches on `id`; when
the list is identified by `slug`, write the callbacks in a hook as above.

```tsx
// app/src/features/entitlements/components/entitlement-table-actions.tsx (abridged)
const deleteMutation = useMutation({
  ...deleteEntitlementMutation(),
  ...optimisticDeleteCallbacks<Entitlement>(
    queryClient,
    listEntitlementsQueryKey(),
    entitlement.id,
    {
      success: t('Pages.Entitlements.Mutation.deleteSuccess'),
      error: t('Common.deleteError', 'Error deleting entitlement'),
    },
  ),
});
```

Use an optimistic update for deletes and simple toggles
(`use-notification-preferences.ts` in `app/src/features/notifications/hooks/` toggles
a preference the same way). For a create or an edit, invalidate in `onSuccess`
instead. See [query key invalidation](./query-key-invalidation.md).

## Billing refusals

The billing calls answer a problem document with a stable `code` and a `detail`. The console shows the `detail` as written and keeps no `Errors.api.<code>` translation per code: `check:api-error-i18n` covers only the generic categories above. `ProblemAlert` (`app/src/domains/billing/components/`) is what a billing dialog renders: the `detail`, or a generic message with the `code` in a monospace hint when there is none. `handleBillingProblem` (`app/src/domains/billing/logic/billing-problem.ts`) recognises the few codes that change what a screen does, such as a missing scope (a banner naming it), billing being off, a 503 (nothing was changed, with a retry) and a boundary being closed (`Retry-After`), and `applyProblemFieldErrors` puts the field errors of a 422 on a form. A deletion that billing or a reference refuses (409 `DeleteInstance.BillingActive`, `DeleteCustomer.BillingActive`, `DeleteEntitlement.InUseConflict`) is explained in a dialog and not a toast, because a bare error would leave the person guessing what to settle first: `useDeletionRefusal` answers whether a failure was one, and renders `DeletionRefusalDialog` with the status of the subscription, the invoices not settled and what still uses the record, each with a link; any other failure keeps its toast. The optimistic delete of the entitlements list puts the row back through the `handleError` option of `optimisticDeleteCallbacks`, which is given the failure and the variables of the delete, and its dialog is held by the table and not by the row: the row leaves the list while the API answers, and a row is keyed by its position, so the last one unmounts with whatever it holds and another shows a different record by the time the answer comes. Billing mutations never use the optimistic helpers: a refusal must not show as a success. A route that reads one record uses `BillingRouteError` as its `errorComponent` (the refusal in the API's words, a 404 as a page that does not exist, a Retry that invalidates the router), a read inside a page `RetryableProblem`, and a refusal shown in a dialog takes the focus with `ProblemAlert autoFocus`, since the confirmation was disabled while the API answered and dropped the focus with it. See [billing](../../src/domains/billing/README.md).

## Errors that are not failures

Some errors are an expected answer, not a failure to report:

- **A status the caller expects.** `getAttioSettings`
  (`app/src/domains/crm-sync/queries/attio-settings-query-options.ts`) reads a 404 as
  "not configured yet" and returns `null`. `getWebhooksServed`
  (`app/src/domains/webhooks/webhooks-served.ts`) reads a 404 and a 403 as "webhooks
  are not served here" and returns `false`.
- **A missing entity.** `RouteError` and the breadcrumbs test `isNotFoundError`.
- **A read the API refuses.** `RouteError` tests `isForbiddenError` and shows
  `RestrictedAccess` instead of the error card. The metadata fields page
  (`app/src/features/settings/metadata-fields/`) reads with a query that does not
  suspend, so the failure never reaches the router: the page has its own check and
  its own "Restricted access" state.
- **Input the user typed that cannot be parsed.** The Try it dialog of a feature flag
  (`app/src/features/feature-flags/components/try-it-dialog.tsx`) parses the JSON
  context in a `try`/`catch`, and shows `Pages.FeatureFlags.TryIt.invalidJson` in the
  dialog instead of sending the request.
- **A verdict only the server can give.** A targeting rule is checked by the server
  (`lintTargetingRule`), through an async field validator, so the form reports it
  like any other invalid field. See
  `app/src/features/feature-flags/targeting/components/targeting-base-fields.tsx`.

## Testing

- `getApiErrorMessage` is unit-tested with `new ApiError({ status, data })` in
  `app/src/lib/errors/__tests__/api-error-handler.test.ts`. Build an `ApiError` the
  same way in a test that needs a failing request.
- What `graphqlClient.request` throws is unit-tested in
  `app/src/lib/__tests__/graphql-client.test.ts`, with a `fetch` that answers a
  `Response` carrying the API's `Problem`.
- Hook and component tests mock the `sonner` module so that `toast.error` and
  `toast.success` are spies, and assert on them, as
  `app/src/features/feature-flags/hooks/use-feature-flag-form.test.tsx` does.
- The application E2E suite asserts the visible toast through
  `app/e2e/app/_support/assertions/toast.ts`. See [testing](../06-testing/README.md).
- What `RouteError` renders for each thrown value is unit-tested in
  `app/src/components/route/__tests__/route-error.test.tsx`.

## See also

- [Data flow](../01-architecture/data-flow.md): the read and write paths.
- [Query key invalidation](./query-key-invalidation.md): refreshing the cache after a
  mutation.
- [Forms](../03-patterns/forms.md): the forms that submit these mutations.
