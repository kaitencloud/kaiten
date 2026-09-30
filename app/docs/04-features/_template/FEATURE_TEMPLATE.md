# Feature template

This page describes how a feature is laid out in `app/src/features/<name>/`, what its main files do, and the model of the README that documents it. It shows the structure the existing features share. The rules behind it (layers, what a feature may import, what is enforced) are in [AI_CONTEXT.md](../../AI_CONTEXT.md); this page links there and gives examples.

Run every `pnpm run` command from `app/`.

## Structure

A feature has the folders it needs. `audit-trail` has only `components/`, `index.ts` and `README.md`; the larger features have most of the following.

```txt
app/src/features/<name>/
├── components/
│   ├── <name>-page-content.tsx       # the screen a route renders
│   ├── <name>-table.tsx              # pieces of the screen, one component per file
│   ├── <name>-form-dialog.tsx
│   ├── <screen>/                     # a large screen gets a subfolder
│   ├── __tests__/                    # unit tests of the components
│   ├── stories/                      # Storybook stories, <component>.stories.tsx
│   └── index.ts                      # the components the feature exports
├── hooks/                            # mutation hooks, view-model hooks, hooks over a store
├── queries/
│   ├── <name>-query-options.ts       # query options built on the generated client
│   └── index.ts
├── schemas/
│   ├── <name>.schema.ts              # Zod schemas derived from the generated ones
│   └── index.ts
├── store/
│   ├── <name>-store.ts               # TanStack Store factory with named actions
│   └── index.ts
├── types/
│   └── index.ts
├── utils/                            # pure helpers, with __tests__/ beside them
├── <name>.api.ts                     # hand-written client calls, see "Generated code"
├── index.ts                          # the public API, for routes only
└── README.md
```

- `components/`, `index.ts` and `README.md` are in every feature.
- A screen lives in `components/`. A feature that has several screens groups each one in a subfolder, such as `components/customer-detail/`.
- Stories go in a `stories/` folder and unit tests in a `__tests__/` folder, both inside the folder of the code they cover. A test may also sit next to its file.
- A subfolder's `index.ts` lists the symbols that the rest of the feature imports from it, as `components/index.ts` and `queries/index.ts` do. Add one when other folders import from the subfolder.
- `schemas/` holds the Zod schemas of the feature's forms. Some features keep the schema of a form next to the form instead, in a `*.shared.ts` file: `customers`, `entitlements` and `instances` do.
- A feature that owns an endpoint the OpenAPI contract does not describe keeps the calls in a `<name>.api.ts` module with local types. See [Generated code](../../AI_CONTEXT.md#generated-code).
- Code stays in the feature until a second feature needs it, then it moves to `app/src/domains/<name>/`. See [Layers](../../AI_CONTEXT.md#layers).

[`file-structure.txt`](./file-structure.txt) is the same tree, short enough to copy.

## Key files

### `components/index.ts`

The barrel of the components that the feature exports. It lists them by name.

```ts
// app/src/features/customers/components/index.ts (abridged)
export { CustomerDetailPageContent } from './customer-detail-page-content';
export { CustomerForm } from './customer-form';
export { CustomerFormDialog } from './customer-form-dialog';
export { CustomersPageContent } from './customers-page-content';
```

### `queries/<name>-query-options.ts`

Query options come from the generated client. A route loader and a component use the same object. Cache helpers such as `invalidate<Name>Queries` sit beside them, in this file or in a `<name>-query-invalidation.ts` file.

```ts
// app/src/features/customers/queries/customer-query-options.ts
import { getCustomerOptions } from '@/api-client/@tanstack/react-query.gen';

export const customerQueryOptions = (customerSlug: string) =>
  getCustomerOptions({ path: { customerSlug } });
```

```ts
// app/src/features/customers/queries/index.ts
export { customerQueryOptions } from './customer-query-options';
```

After a mutation, invalidate with the generated query keys: see [query key invalidation](../../02-conventions/query-key-invalidation.md).

### `schemas/<name>.schema.ts`

A form schema starts from the generated Zod schema and extends it, so the two cannot drift. Validation messages are translation keys. See [forms](../../03-patterns/forms.md).

```ts
// app/src/features/licenses/schemas/license.schema.ts (abridged)
import { z } from 'zod';
import { zLicenseWritable } from '@/api-client/zod.gen';

export const licenseFormSchema = zLicenseWritable
  .pick({ name: true, description: true, type: true, versionName: true })
  .extend({
    name: z.string().min(1, 'Pages.Licenses.Mutation.Form.Errors.name'),
    createAsDraft: z.boolean(),
  });

export type LicenseFormValues = z.infer<typeof licenseFormSchema>;
```

```ts
// app/src/features/licenses/schemas/index.ts
export type { LicenseFormValues } from './license.schema';
export { licenseFormSchema } from './license.schema';
```

### `store/<name>-store.ts` and its hook

A store holds UI state that several components of the feature share, such as the choice made in a dialog, or a local draft with an explicit life cycle (initialise, reset, submit), such as the entitlement editor of `licenses`. It does not mirror data that the page only displays: that stays in TanStack Query. A factory in `store/` builds the store and its actions, and a hook in `hooks/` creates one instance for each mounted form or card. See [state management](../../03-patterns/state-management.md) and its section [Drafts and optimistic updates](../../03-patterns/state-management.md#drafts-and-optimistic-updates).

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
      store.setState((state) => ({ ...state, selectedBaseLicenseSlug: slug }));
    },
    // ...
  };

  return { store, actions };
}
```

```ts
// app/src/features/licenses/hooks/use-license-version-form-store.ts (abridged)
import { useStore } from '@tanstack/react-store';
import { useState } from 'react';
import { createLicenseVersionFormStore } from '../store';

export function useLicenseVersionFormStore(initialBaseLicenseSlug = '') {
  const [{ store, actions }] = useState(() =>
    createLicenseVersionFormStore(initialBaseLicenseSlug),
  );
  const state = useStore(store, (snapshot) => snapshot);

  return {
    selectedBaseLicenseSlug: state.selectedBaseLicenseSlug,
    setSelectedBaseLicenseSlug: actions.setSelectedBaseLicenseSlug,
    store,
  };
}
```

### `hooks/`: mutations and view models

A mutation hook owns the mutation and the invalidation of the cache, so components do not call `invalidateQueries`. A detail page that assembles several queries and several actions can use a view-model hook, which only assembles smaller hooks. `instances` does it for its detail page:

```txt
app/src/features/instances/hooks/
├── use-instance-detail-view-model.ts        # assembles the three hooks below
└── instance-detail/
    ├── use-instance-detail-data.ts          # the queries
    ├── use-instance-detail-mutations.ts     # the mutations, their invalidation and toasts
    └── use-instance-detail-derived-state.ts # values computed for display
```

Use this split when a page needs it: the other features have plain hooks.

### `index.ts`: the public API

The root `index.ts` lists what the routes of the feature consume, by name. It exports types with `export type` and does not use `export *`.

```ts
// app/src/features/customers/index.ts
export {
  CustomerDetailPageContent,
  CustomerFormDialog,
  CustomersPageContent,
} from './components';
export { customerQueryOptions } from './queries';
```

### Imports

Only routes import `@/features/<name>`. Inside a feature, a file imports its own files with a relative path. The two sides of the rule are in [Import rules](../../AI_CONTEXT.md#import-rules).

```ts
// app/src/routes/customers/index.tsx
import { CustomersPageContent } from '@/features/customers';

// app/src/features/deployment-zones/components/deployment-zones-page-content.tsx
import { deploymentZonesQueryOptions } from '../queries';
```

## Names

The file names are kebab-case, and lint enforces it. The rest of the names follow [Conventions](../../AI_CONTEXT.md#conventions). The feature files follow these patterns:

| File | Pattern | Example |
| --- | --- | --- |
| Screen | `<name>-page-content.tsx` | `customers-page-content.tsx` |
| Query options | `queries/<name>-query-options.ts` | `queries/customer-query-options.ts` |
| Cache helpers | `queries/<name>-query-invalidation.ts` | `queries/release-query-invalidation.ts` |
| Schema | `schemas/<name>.schema.ts` | `schemas/license.schema.ts` |
| Store factory | `store/<name>-store.ts` | `store/license-version-form-store.ts` |
| Hook over a store | `hooks/use-<name>-store.ts` | `hooks/use-license-version-form-store.ts` |
| Hand-written client calls | `<name>.api.ts` | `webhooks.api.ts` |
| Story | `components/stories/<component>.stories.tsx` | `components/stories/customer-table.stories.tsx` |
| Unit test | `__tests__/<file>.test.ts(x)` | `components/__tests__/customer-form.test.tsx` |

## Common mistakes

| Mistake | What to do |
| --- | --- |
| A component or a hook imports the feature through `@/features/<name>` | Import the file with a relative path. The root barrel is for routes, and the check rejects any other importer. |
| A feature imports another feature, even for a type | Move what they share to `app/src/domains/<name>/`. |
| A feature imports `routes/` | Routes assemble features, never the reverse: pass what the feature needs as props, or use the TanStack Router hooks. |
| API data copied into a store or into `useState` only to display it | Read it with a query. A store holds UI state and local drafts, not a mirror of the query data. |
| A schema written by hand for a shape the API already generates | Derive it from `@/api-client/zod.gen`. |
| An invalidation written with an array literal | Use the generated `...QueryKey` function. See [query key invalidation](../../02-conventions/query-key-invalidation.md). |
| `export *` in a feature root | List the exports by name. |
| A DOM form wired as `onSubmit={form.handleSubmit}` | Use `createFormSubmitHandler`, as [forms](../../03-patterns/forms.md) shows. |
| A route that holds a mutation or UI state | Move it into the feature. Lint rejects `useMutation`, `useState` and `useReducer` in route files. The app shell under `routes/-components/` may keep local state. |

## Check the feature

From `app/`, `pnpm run check:ci` chains the checks that App CI runs, among them lint, both type checks, the architecture check, the file sizes, the i18n checks, the unit tests and a production build. To iterate on a feature, run the ones that catch most structure mistakes:

```bash
pnpm run check:architecture   # import rules between layers and features
pnpm run lint                 # restricted imports, file names
pnpm run typecheck
pnpm run test
```

[Checks](../../AI_CONTEXT.md#checks) explains the structural checks and what `check:ci` chains, and the [checklist of CONTRIBUTING.md](../../../../CONTRIBUTING.md#before-you-open-a-pull-request) is the one to follow before a pull request. Stories run with `pnpm run test:stories`. No command checks the [principles](../../AI_CONTEXT.md#principles) or the README: a reviewer reads them.

## Feature README model

Every feature has a `README.md` at its root. It is the only page that documents the feature, and it is written for a developer who opens the feature for the first time. Write it in present tense, say what the code does today, and leave out history.

Use these sections, in this order, and only the ones that apply:

```md
# <Feature>

One paragraph: what the feature is for and what a user does with it.

## Routes

The URLs the feature serves, each with its route file and what it renders.

## Structure

The folder tree, with a short comment per file or folder that is not obvious.

## Data

What the feature reads and writes: queries, mutations, generated operations,
hand-written calls, and how the cache is invalidated.

## Behaviour

The business rules a reader cannot see from the file names: permissions or scopes,
flags, validation, what happens after a save or a delete.

## Tests

Where the unit tests, the stories and the E2E specs of the feature are.

## Public API

What `index.ts` exports and which routes import it.
```

What each section holds:

- **Title and paragraph.** The title is the feature's name, in sentence case (`# Feature flags`). The paragraph says what it is for, not how it is built.
- **Routes.** A table with the URL, the route file and what it renders. A feature with no route of its own says which routes mount it.
- **Structure.** A tree in a `txt` code block, rooted at `app/src/features/<name>/`. Comment what a reader would not guess. For a long file list, link to the folder instead of listing every file, since the list goes stale.
- **Data.** Name the query options, the generated operations (`listCustomers`, `createCustomerMutation`), the hand-written calls and the keys that a mutation invalidates. Do not copy the OpenAPI contract: link to `app/openapi.yaml` when a reader needs it.
- **Behaviour.** One bullet or one short subsection per rule. Include permissions and scopes, and the flags that show or hide the feature.
- **Tests.** The folders and the main files, the stories (and whether the visual regression suite covers them), and the E2E folder under `app/e2e/app/`. Say so when there are none.
- **Public API.** The exports of `index.ts`, and who imports them. Link to [Import rules](../../AI_CONTEXT.md#import-rules) instead of restating them.

Conventions for the page:

- Paths are written from the repository root, in backticks: `app/src/features/customers/index.ts`. Links to other pages are relative Markdown links.
- Link to a rule rather than restating it: the layers, the import rules and the conventions have one home, [AI_CONTEXT.md](../../AI_CONTEXT.md).
- Do not document what is generated. Say which command generates it.
- Keep it short enough to stay true. A change that alters what the feature does or how it is built updates the README in the same pull request.

Add a row for the new feature to the [entry table](../README.md).

## Examples

- [`customers`](../../../src/features/customers/): create and edit in a dialog opened by a route, a detail page, query options, no store.
- [`deployment-zones`](../../../src/features/deployment-zones/) and [`licenses`](../../../src/features/licenses/): a `store/` for shared UI state, `schemas/` derived from the generated ones, hooks over the stores.
- [`instances`](../../../src/features/instances/): a detail page assembled by a view-model hook.
- [`webhooks`](../../../src/features/webhooks/): server state only, with queries and mutation hooks, no store, and the calls of `webhooks.api.ts`.
- [`feature-flags`](../../../src/features/feature-flags/): the largest feature, with the submodules `rollout/`, `targeting/` and `variants/`, which the architecture check keeps private to it.
- [`audit-trail`](../../../src/features/audit-trail/): the smallest feature, one page assembled from `app/src/domains/audit-trail/`.
