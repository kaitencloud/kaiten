---
name: new-feature
description: Scaffold a new feature module following Kaiten conventions. Creates the components folder, the route-level index.ts and the feature README. Optionally adds schemas/, queries/ and a store with its hook.
arguments:
  - name: feature-name
    description: "Kebab-case name of the feature (ex: billing, audit-logs, notifications)"
    required: true
  - name: with-schema
    description: "Whether to add a schemas/ directory with Zod schema (yes/no, default: no)"
    required: false
  - name: with-queries
    description: "Whether to add a queries/ directory for TanStack Query options (yes/no, default: no)"
    required: false
  - name: with-store
    description: "Whether to add a store/ factory and a hooks/ hook over it, for UI state shared by several components (yes/no, default: no)"
    required: false
---

# Scaffold new Kaiten feature

Scaffold a feature module at `app/src/features/<feature-name>/` following
`app/docs/04-features/_template/FEATURE_TEMPLATE.md`. A feature has the folders it
needs: `components/`, `index.ts` and `README.md` are in every feature, the other
folders (`hooks/`, `types/`, `store/`, `queries/`, `schemas/`, `utils/`) are added
when the feature needs them. Do not create empty folders.

## Rules

- All filenames: kebab-case
- All component names: PascalCase
- All hook names: camelCase with `use` prefix
- Types: PascalCase with `export type`
- No `export *` — always explicit named exports
- `features/<name>/index.ts` is reserved for route consumers ONLY
- Inside the feature, import its own files with relative paths
- A store is a factory, never a store created at module level

The layers and import rules are in `app/docs/AI_CONTEXT.md`.

## Files to create

### Always create

**`app/src/features/<feature-name>/components/<feature-name>-page-content.tsx`**
```tsx
type <FeatureName>PageContentProps = {
  // TODO: add props
};

export function <FeatureName>PageContent({}: <FeatureName>PageContentProps) {
  return <div />;
}
```

**`app/src/features/<feature-name>/components/index.ts`**
```ts
export { <FeatureName>PageContent } from './<feature-name>-page-content';
```

**`app/src/features/<feature-name>/index.ts`** (route-level public API ONLY)
```ts
// Route-level public API — only export what src/routes/** needs
export { <FeatureName>PageContent } from './components';
```

**`app/src/features/<feature-name>/README.md`**, written from the model in the
"Feature README model" section of `FEATURE_TEMPLATE.md`. Start with:
```md
# <Feature name>

<One paragraph: what the feature is for and what a user does with it.>

## Routes

| Path | Route file |
| --- | --- |
| `/<path>` | `app/src/routes/<path>/index.tsx` |

## Structure

<The folder tree, with a short comment per file or folder that is not obvious.>

## Public API

<What `index.ts` exports and which routes import it.>
```
Add `Data`, `Behaviour` and `Tests` sections when they apply, in the order of the
model.

### If with-store=yes, also create

The store is a factory in `store/`, and a hook in `hooks/` creates one instance per
mounted component. See `app/docs/03-patterns/state-management.md`.

**`app/src/features/<feature-name>/store/<feature-name>-store.ts`**
```ts
import { Store } from '@tanstack/react-store';

export type <FeatureName>StoreState = {
  // TODO: add UI state (dialog choice, selection, local draft)
};

export function create<FeatureName>Store() {
  const initialState: <FeatureName>StoreState = {
    // TODO: initial state
  };
  const store = new Store(initialState);

  const actions = {
    // TODO: named actions, each one calling store.setState
  };

  return { store, actions };
}
```

**`app/src/features/<feature-name>/store/index.ts`**
```ts
export { create<FeatureName>Store } from './<feature-name>-store';
export type { <FeatureName>StoreState } from './<feature-name>-store';
```

**`app/src/features/<feature-name>/hooks/use-<feature-name>-store.ts`**
```ts
import { useStore } from '@tanstack/react-store';
import { useState } from 'react';
import { create<FeatureName>Store } from '../store';

export function use<FeatureName>Store() {
  const [{ store, actions }] = useState(() => create<FeatureName>Store());
  const state = useStore(store, (snapshot) => snapshot);

  return { ...state, ...actions, store };
}
```

**`app/src/features/<feature-name>/hooks/index.ts`**
```ts
export { use<FeatureName>Store } from './use-<feature-name>-store';
```

### If with-schema=yes, also create

**`app/src/features/<feature-name>/schemas/<feature-name>.schema.ts`**
```ts
import { z } from 'zod';
// Import the generated schema from the API client and extend it
// import { z<Entity>Writable } from '@/api-client/zod.gen';
// NEVER redefine manually what the API already defines

export const <featureName>FormSchema = z.object({
  // TODO: use z<Entity>Writable.pick({ ... }).extend({ ... }) instead of redefining
  // A validation message is a translation key: add it to en.ts and fr.ts
  name: z.string().min(1, 'Pages.<FeatureName>.Mutation.Form.Errors.name'),
});

export type <FeatureName>FormValues = z.infer<typeof <featureName>FormSchema>;
```

**`app/src/features/<feature-name>/schemas/index.ts`**
```ts
export { <featureName>FormSchema } from './<feature-name>.schema';
export type { <FeatureName>FormValues } from './<feature-name>.schema';
```

### If with-queries=yes, also create

**`app/src/features/<feature-name>/queries/<feature-name>-query-options.ts`**
```ts
// Use the generated query options from @tanstack/react-query.gen. They are named
// after the operation: list<Entity>Options, get<Entity>Options.
// import { list<Entity>Options } from '@/api-client/@tanstack/react-query.gen';

export const <featureName>QueryOptions = () => {
  // TODO: return the generated options, or queryOptions({ ... }) built on them
};
```

**`app/src/features/<feature-name>/queries/index.ts`**
```ts
export { <featureName>QueryOptions } from './<feature-name>-query-options';
```

Also add to `app/src/features/<feature-name>/index.ts`:
```ts
export { <featureName>QueryOptions } from './queries';
```

## After scaffolding

- Add the feature's row to the entry table in `app/docs/04-features/README.md`.
- Add the translation keys the feature uses to both `en.ts` and `fr.ts`.
- Check `app/src/features/<feature-name>/` structure looks correct, then run
  `pnpm run check:architecture` from `app/`.
