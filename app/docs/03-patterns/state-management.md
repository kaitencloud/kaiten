# State management

State lives in three layers, each with one job, plus two places beside them: the URL and the settings persisted in `localStorage`. The convention is stated in [AI_CONTEXT.md](../AI_CONTEXT.md#conventions); this page says where each kind of state goes and shows the code.

## The layers

| Layer | Tool | Holds | Example |
| --- | --- | --- | --- |
| Server state | TanStack Query | API data: cache, invalidation, refetch | `useSuspenseQuery(licenseQueryOptions(licenseSlug))` |
| Feature UI state | TanStack Store | UI state shared inside one feature | `useLicenseVersionFormStore()`: the base license the user picked |
| Local state | React `useState` | State of one component, shared with nobody | `const [isExpanded, setIsExpanded] = useState(false)` |
| URL state | TanStack Router search params | What a user can share or find again after a refresh | `?status=unread` on `/notifications` |
| Persisted settings | TanStack DB, in `localStorage` | Settings of the whole frontend | the theme, the language, whether the side navigation is expanded |

## Rules

No command checks these rules; they are reviewed in pull requests.

1. **The server state stays in TanStack Query.** Do not copy it into a store or into `useState`. Data that comes from an API goes through Query, the single source of truth. This avoids the fragile synchronisation of `useEffect(() => setState(query.data), [query.data])`, and keeps cache bugs apart from UI bugs.
2. **Invalidate from the mutation hooks.** The hooks of a feature update or invalidate the cache; components do not call `invalidateQueries`.
3. **Compute derived values at render.** Do not synchronise them with `useEffect`. Use store actions for the transitions of the UI.
4. **Prefer a store with named actions** once a feature has several coupled UI transitions (dialogs, selection, inline editing, navigation inside the feature). Do not stack `useState` or `useReducer` and `useEffect` to orchestrate them.
5. **Keep local state local.** `useState` is for state that no other component reads and that needs no orchestration.

## Layer 1: TanStack Query (server state)

Query holds everything that comes from the server: loading, cache, synchronisation, invalidation. A component reads with a query options object, a hook of the feature writes with a mutation and invalidates:

```tsx
// Read, in a component (options from app/src/features/licenses/queries/license-query-options.ts)
const { data: license } = useSuspenseQuery(licenseQueryOptions(licenseSlug));
```

```tsx
// app/src/features/entitlements/hooks/use-entitlement-form-mutations.ts (abridged)
const updateMutation = useMutation({
  ...updateEntitlementMutation(),
  onSuccess: async (_response, variables) => {
    const { path } = variables;

    await Promise.all([
      invalidateEntitlements(),
      queryClient.invalidateQueries({
        queryKey: getEntitlementQueryKey({
          path: { entitlementSlug: path.entitlementSlug },
        }),
      }),
    ]);
  },
});
```

What goes in Query:

- everything loaded from the REST or GraphQL API;
- the cache shared between navigations;
- the loading state (`isPending`, `isError`).

What does not:

- the open or closed state of a dialog;
- the selected row of a table;
- filters that are not in the URL.

[Query key invalidation](../02-conventions/query-key-invalidation.md) covers cache management.

## Layer 2: TanStack Store (feature UI state)

A store holds UI state shared between several components of one feature. It is created by a factory that returns the store and its actions, and a hook creates one instance per mounted form or card:

```ts
// app/src/features/licenses/store/license-version-form-store.ts (abridged)
import { Store } from '@tanstack/react-store';

export function createLicenseVersionFormStore(initialBaseLicenseSlug = '') {
  const store = new Store<LicenseVersionFormStoreState>({
    hasInitializedBaseEntitlements: false,
    selectedBaseLicenseSlug: initialBaseLicenseSlug,
  });

  const actions: LicenseVersionFormStoreActions = {
    setSelectedBaseLicenseSlug: (slug: string) => {
      store.setState((state) => ({
        ...state,
        selectedBaseLicenseSlug: slug,
      }));
    },
    // …
  };

  return { store, actions };
}
```

```ts
// app/src/features/licenses/hooks/use-license-version-form-store.ts (abridged)
export function useLicenseVersionFormStore(initialBaseLicenseSlug = '') {
  const [{ store, actions }] = useState(() =>
    createLicenseVersionFormStore(initialBaseLicenseSlug),
  );
  const state = useStore(store, (snapshot) => snapshot);

  return {
    selectedBaseLicenseSlug: state.selectedBaseLicenseSlug,
    setSelectedBaseLicenseSlug: actions.setSelectedBaseLicenseSlug,
    // …
    store,
  };
}
```

Every store in the code is built this way: a factory called once per instance, in `useState(() => …)` or `useMemo`, never a store created at module level. Two mounted instances, or two tests, then do not share state.

A feature with several transitions gets **named actions** rather than a `useReducer` and synchronising effects. `app/src/features/licenses/store/license-entitlements-card-store.ts` is a fuller example: the add dialog (`openAddDialog`, `closeAddDialog`), inline editing (`startEdit`, `closeEdit`) and the rows being saved.

What goes in a store:

- the state of dialogs shared between components of a feature;
- the active selection, the current tab, an open accordion;
- temporary data of a multi-step form shared between its steps.

What does not:

- server data (use Query);
- state of a single component (use `useState`);
- global state across features: each feature has its own stores.

A component does not need a store just because it is a feature component. `VariantList` and `TargetingList` (in `app/src/features/feature-flags/`) are controlled components: their parent holds the array and receives updates through `onChange`, so they have no store. Introduce a store when a piece of UI state is really shared between several components of a feature.

### Drafts and optimistic updates

Two cases keep data next to the store or the cache on purpose:

- **A local draft**: a multi-step form or a temporary edit, with an explicit life cycle (initialise, reset, submit). `app/src/features/licenses/store/license-entitlements-draft-store.ts` is a write buffer for the entitlement editor.
- **An optimistic update**, made in the Query cache with `setQueryData` and rolled back in `onError`, never in a UI store. `app/src/features/releases/hooks/use-delete-release-mutation.ts` does it.

## Layer 3: React state (local state)

`useState` holds what one component owns and no neighbour reads:

```tsx
const [isExpanded, setIsExpanded] = useState(false);
```

Use it for the internal state of an unshared component, for the value of an input that TanStack Form does not manage, and for a local toggle that changes nothing outside the component. Do not use it for API data (Query) or for state shared between the components of a feature (Store).

## URL state

State that a user can want to share or come back to after a refresh belongs in the URL. TanStack Router validates search params with `validateSearch`, and `loaderDeps` makes the loader depend on them:

```tsx
// app/src/routes/notifications/index.tsx (abridged)
const notificationsSearchSchema = z.object({
  status: z.enum(['all', 'unread']).optional(),
});

export const Route = createFileRoute('/notifications/')({
  component: NotificationsRoute,
  validateSearch: (search) => notificationsSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ status: search.status ?? 'all' }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureInfiniteQueryData(
      notificationsFeedQueryOptions(deps.status),
    ),
});
```

In the code:

- the view mode of the feature flag list (`?view=list`);
- the status filter of the notifications;
- the scope of a list that the API applies, such as the customer or the instance of the invoices (`validateSearch` drops what does not read as a slug): see [tables](./tables.md#a-list-page). The filters of such a list stay in the browser and out of the URL, like those of any other list;
- the active tab of a page, which is a child route or, where the tabs are one route, its search (`RouteTabs`, `DetailEntityLayout.Tabs`; the list of invoices has `?view=handoff`, and the part of the queue `?queue=`);
- the edit mode of a detail page (`?mode=configure`, see [dialog via route](./dialog-via-route.md#the-modeconfigure-edit-mode)).

The sort and the page of a table live in the state of `DataTable`, not in the URL. Transient state, such as which dialog is open, stays in a store or in `useState`, unless a route renders the dialog.

## Persisted settings

Some UI settings belong to the whole frontend and must survive a refresh: the theme, the language, whether the side navigation is expanded. They have no server source, so they are not Query state, and they are not scoped to a feature, so they are not Store state. They live in a **TanStack DB** collection stored in `localStorage`, which also syncs between tabs through the `storage` event.

- The schema and the collection are in `app/src/lib/settings/`.
- Components read and write them through `useAppSettings` (`app/src/hooks/use-app-settings.ts`), not through direct `localStorage` calls.
- To add a setting, extend the schema and expose a setter next to the existing ones.

Business or API data, state of one component and feature-specific UI orchestration do not belong there.

## Deciding

```txt
A new piece of data to manage?
│
├─ Does it come from the API?
│   └─ Yes → TanStack Query
│
├─ Should it be bookmarkable or shareable?
│   └─ Yes → URL search params (validateSearch)
│
├─ Is it a setting of the whole frontend that survives a refresh?
│   └─ Yes → persisted settings (TanStack DB)
│
├─ Is it shared between several components of a feature?
│   └─ Yes → TanStack Store (named actions when the transitions are complex)
│
└─ Is it local to one component?
    └─ Yes → React useState
```

## Case study: creating a service account token

The token creation page (`app/src/features/service-accounts/`) shares nothing between components, so it has no store:

```txt
Service accounts feature
│
├─ TanStack Query         → the list, and the account the route loads
│   useSuspenseQuery(serviceAccountsQueryOptions)
│   ensureQueryData(serviceAccountQueryOptions(slug))
│
├─ Router                 → which account receives the token
│   /integrations/service-accounts/$serviceAccountSlug/tokens/new
│
├─ TanStack Form          → name, expiry, access level per resource
│   useTokenCreateForm()
│
└─ Mutation result        → the created token, shown once (gcTime: 0)
    useCreateServiceAccountToken(slug).createdToken
```

The URL carries the account, the form carries its input and the mutation carries the result. With `gcTime: 0` the token does not outlive the page that shows it: it is in no cache and not in the URL.
